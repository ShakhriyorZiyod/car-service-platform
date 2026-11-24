import type {
  AdminShopOrder,
  ShopCategory,
  ShopOrder,
  ShopProduct,
  ShopProductCard,
  ShopQuote,
} from '@cs/shared';
import type { CallOutcome, OrderTab, ShopOrderStatus, ShopOrderTab } from '@cs/shared/vocabulary';
import { ACTIVE_SHOP_ORDER_STATUSES } from '@cs/shared/vocabulary';
import { and, asc, desc, eq, ilike, inArray, notInArray, or, sql } from 'drizzle-orm';
import type { DbOrTx, Tx } from '../../../db/client';
import {
  cancelReasons,
  fiscalReceipts,
  payments,
  shopOrderCalls,
  shopOrderItems,
  shopOrders,
  statusHistory,
  users,
} from '../../../db/schema';
import { presentInstant } from '../../../lib/time';
import {
  requirePermission,
  requireVerifiedPhone,
  type ClientActor,
  type StaffActor,
} from '../../../platform/actors';
import type { PlatformDeps } from '../../../platform/deps';
import { AppError, invalidAt } from '../../../platform/errors';
import type { Outbox } from '../../../platform/outbox';
import { violatedUniqueConstraint } from '../../../platform/pg-errors';
import type { ScheduledTask, StaffDirectory } from '../../../platform/ports';
import { recordStatus } from '../../../platform/status-history';
import type { Notification } from '../../../notifications/types';
import type { AuditService } from '../../audit';
import { checkDiscount, holdAfterNoAnswer, type DiscountInput } from '../../orders';
import type { PaymentsService } from '../../payments';
import type { CatalogQuery, ShopStockService, StockLine } from '../../stock';
import { addWorkMinutes, type WorkshopService } from '../../workshop';
import {
  TAB_STATUSES,
  canTransition,
  expiredReason,
  holdsReserve,
  mergeLines,
  pickupUntilOf,
  priceCart,
  staffActions,
  type CartLine,
} from '../domain/shop-order';

/**
 * The shop (docs/PLAN.md, sections 9.5 and 11; stage 9): the client's catalog, cart and orders;
 * the panel's queue, call, gathering, handover and the quick sale at the counter. The goods of an
 * order are reserved from the moment it is placed and leave the warehouse when it is handed over.
 */

export interface ShopDeps extends PlatformDeps {
  audit: AuditService;
  outbox: Outbox;
  staff: StaffDirectory;
  workshop: Pick<WorkshopService, 'settings' | 'hours'>;
  stock: ShopStockService;
  payments: Pick<PaymentsService, 'recordInside'>;
}

export interface CheckoutInput {
  requestId: string;
  payments: readonly { method: 'cash' | 'card_terminal' | 'transfer'; amount: number }[];
  receiptNo: string;
}

export interface ShopService {
  // The client
  categories(): Promise<ShopCategory[]>;
  products(query: CatalogQuery): Promise<ShopProduct[]>;
  product(id: string): Promise<ShopProductCard>;
  quote(lines: readonly CartLine[]): Promise<ShopQuote>;
  create(
    actor: ClientActor,
    input: { requestId: string; items: readonly CartLine[]; comment: string | null },
  ): Promise<ShopOrder>;
  list(actor: ClientActor, tab: OrderTab): Promise<ShopOrder[]>;
  get(actor: ClientActor, id: string): Promise<ShopOrder>;
  cancel(
    actor: ClientActor,
    id: string,
    input: { reasonId: string; note?: string | null | undefined },
  ): Promise<ShopOrder>;

  // The panel
  staffList(
    actor: StaffActor,
    query: { tab: ShopOrderTab; q?: string | undefined },
  ): Promise<AdminShopOrder[]>;
  staffGet(actor: StaffActor, id: string): Promise<AdminShopOrder>;
  call(
    actor: StaffActor,
    id: string,
    input: {
      outcome: CallOutcome;
      reasonId?: string | undefined;
      note?: string | null | undefined;
    },
    ip?: string,
  ): Promise<AdminShopOrder>;
  ready(actor: StaffActor, id: string, ip?: string): Promise<AdminShopOrder>;
  staffCancel(
    actor: StaffActor,
    id: string,
    input: { reasonId: string; note?: string | null | undefined },
    ip?: string,
  ): Promise<AdminShopOrder>;
  setDiscount(
    actor: StaffActor,
    id: string,
    input: (DiscountInput & { reason: string }) | { kind: 'none' },
    ip?: string,
  ): Promise<AdminShopOrder>;
  checkout(
    actor: StaffActor,
    id: string,
    input: CheckoutInput,
    ip?: string,
  ): Promise<AdminShopOrder>;
  quickSale(
    actor: StaffActor,
    input: CheckoutInput & { clientId: string | null; items: readonly CartLine[] },
    ip?: string,
  ): Promise<AdminShopOrder>;
  saleProducts(actor: StaffActor): Promise<(ShopProduct & { free: number })[]>;
  /** Counters for "Bugun": null without shop.read. */
  countsFor(actor: StaffActor): Promise<{ newOrders: number; readyForPickup: number } | null>;

  tasks: ScheduledTask[];
}

type OrderRow = typeof shopOrders.$inferSelect;
const STAFF_ROLES = ['admin', 'owner'] as const;

export function createShopService(deps: ShopDeps): ShopService {
  const { db, clock, audit, outbox, staff, workshop, stock, payments: kassa } = deps;

  // ---------------------------------------------------------------------------------------------
  // Views

  async function itemsOf(from: DbOrTx, orderIds: readonly string[]) {
    if (orderIds.length === 0) return [];
    return from
      .select()
      .from(shopOrderItems)
      .where(inArray(shopOrderItems.shopOrderId, [...orderIds]))
      .orderBy(asc(shopOrderItems.id));
  }

  async function clientViews(from: DbOrTx, rows: readonly OrderRow[]): Promise<ShopOrder[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const items = await itemsOf(from, ids);
    const reasons = await from
      .select({ id: cancelReasons.id, nameUz: cancelReasons.nameUz, nameRu: cancelReasons.nameRu })
      .from(cancelReasons);
    const history = await from
      .select()
      .from(statusHistory)
      .where(and(eq(statusHistory.entity, 'shop_order'), inArray(statusHistory.entityId, ids)))
      .orderBy(asc(statusHistory.at), asc(statusHistory.id));
    const paid = await from
      .select()
      .from(payments)
      .where(inArray(payments.shopOrderId, ids))
      .orderBy(asc(payments.receivedAt), asc(payments.id));
    const receipts = await from
      .select()
      .from(fiscalReceipts)
      .where(inArray(fiscalReceipts.shopOrderId, ids));
    return rows.map((row) => {
      const reason = reasons.find((candidate) => candidate.id === row.cancelReasonId);
      return {
        id: row.id,
        number: row.number,
        status: row.status,
        fulfillment: row.fulfillment,
        items: items
          .filter((item) => item.shopOrderId === row.id)
          .map((item) => ({
            productId: item.productId,
            nameUz: item.nameUz,
            nameRu: item.nameRu,
            pack: item.pack,
            price: item.price,
            qty: item.qty,
            lineTotal: item.lineTotal,
          })),
        subtotal: row.subtotal,
        discount: row.discountAmount,
        total: row.total,
        comment: row.clientComment,
        createdAt: presentInstant(row.createdAt),
        pickupUntil:
          row.status === 'ready_for_pickup' && row.pickupUntil
            ? presentInstant(row.pickupUntil)
            : null,
        cancelReason: reason ? { uz: reason.nameUz, ru: reason.nameRu } : null,
        payments: paid
          .filter((payment) => payment.shopOrderId === row.id)
          .map((payment) => ({ method: payment.method, amount: payment.amount })),
        receiptNo: receipts.find((receipt) => receipt.shopOrderId === row.id)?.receiptNo ?? null,
        canCancel: canTransition(row.status, 'cancelled', 'client'),
        history: history
          .filter((step) => step.entityId === row.id)
          .map((step) => ({
            status: step.toStatus as ShopOrderStatus,
            at: presentInstant(step.at),
          })),
      };
    });
  }

  async function staffViews(
    from: DbOrTx,
    actor: StaffActor,
    rows: readonly OrderRow[],
  ): Promise<AdminShopOrder[]> {
    if (rows.length === 0) return [];
    const base = await clientViews(from, rows);
    const ids = rows.map((row) => row.id);
    const clientIds = rows.flatMap((row) => (row.clientId ? [row.clientId] : []));
    const clients =
      clientIds.length === 0
        ? []
        : await from
            .select({
              id: users.id,
              fullName: users.fullName,
              phone: users.phone,
              telegramId: users.telegramId,
            })
            .from(users)
            .where(inArray(users.id, clientIds));
    const calls = await from
      .select({ call: shopOrderCalls, adminName: users.fullName })
      .from(shopOrderCalls)
      .innerJoin(users, eq(users.id, shopOrderCalls.adminId))
      .where(inArray(shopOrderCalls.shopOrderId, ids))
      .orderBy(asc(shopOrderCalls.at));
    const paid = await from
      .select()
      .from(payments)
      .where(inArray(payments.shopOrderId, ids))
      .orderBy(asc(payments.receivedAt), asc(payments.id));
    const receipts = await from
      .select()
      .from(fiscalReceipts)
      .where(inArray(fiscalReceipts.shopOrderId, ids));
    const { rules } = await workshop.settings.current(from);
    const can = {
      write: actor.permissions.has('shop.write'),
      checkout: actor.permissions.has('checkout.write'),
    };
    return rows.map((row, index) => {
      const client = clients.find((candidate) => candidate.id === row.clientId);
      const receipt = receipts.find((candidate) => candidate.shopOrderId === row.id);
      const hasDiscount = row.discountAmount > 0 || row.discountPercent !== null;
      return {
        ...(base[index] as ShopOrder),
        source: row.source,
        client: client
          ? {
              id: client.id,
              fullName: client.fullName,
              phone: client.phone,
              hasTelegram: client.telegramId != null,
            }
          : null,
        discountInfo: hasDiscount
          ? { amount: row.discountAmount, percent: row.discountPercent, reason: row.discountReason }
          : null,
        calls: calls
          .filter(({ call }) => call.shopOrderId === row.id)
          .map(({ call, adminName }) => ({
            id: call.id,
            outcome: call.outcome,
            note: call.note,
            at: presentInstant(call.at),
            adminName,
          })),
        paymentLines: paid
          .filter((payment) => payment.shopOrderId === row.id)
          .map((payment) => ({
            id: payment.id,
            method: payment.method,
            amount: payment.amount,
            receivedAt: presentInstant(payment.receivedAt),
          })),
        receipt: receipt
          ? {
              receiptNo: receipt.receiptNo,
              amount: receipt.amount,
              createdAt: presentInstant(receipt.createdAt),
            }
          : null,
        holdUntil: row.status === 'new' && row.holdUntil ? presentInstant(row.holdUntil) : null,
        actions: staffActions(row.status, can),
        discountLimitPct: rules.adminDiscountLimitPct,
        discountUnlimited: actor.permissions.has('discount.unlimited'),
      };
    });
  }

  async function staffView(from: DbOrTx, actor: StaffActor, id: string): Promise<AdminShopOrder> {
    const [row] = await from.select().from(shopOrders).where(eq(shopOrders.id, id));
    if (!row) throw new AppError('not_found');
    const [view] = await staffViews(from, actor, [row]);
    return view as AdminShopOrder;
  }

  async function ownRow(from: DbOrTx, clientId: string, id: string): Promise<OrderRow> {
    const [row] = await from
      .select()
      .from(shopOrders)
      .where(and(eq(shopOrders.id, id), eq(shopOrders.clientId, clientId)));
    // Somebody else's order does not exist for them.
    if (!row) throw new AppError('not_found');
    return row;
  }

  async function ownView(from: DbOrTx, clientId: string, id: string): Promise<ShopOrder> {
    const [view] = await clientViews(from, [await ownRow(from, clientId, id)]);
    return view as ShopOrder;
  }

  // ---------------------------------------------------------------------------------------------
  // Shared steps inside a transaction

  async function locked(tx: Tx, id: string): Promise<OrderRow> {
    const [row] = await tx.select().from(shopOrders).where(eq(shopOrders.id, id)).for('update');
    if (!row) throw new AppError('not_found');
    return row;
  }

  async function linesOf(tx: Tx, id: string): Promise<StockLine[]> {
    const items = await itemsOf(tx, [id]);
    return items.map((item) => ({ productId: item.productId, qty: item.qty }));
  }

  /** What the messages say of an order. */
  async function factsOf(from: DbOrTx, row: OrderRow) {
    const items = await itemsOf(from, [row.id]);
    return {
      shopOrderId: row.id,
      number: row.number,
      items: items.map((item) => ({ nameUz: item.nameUz, nameRu: item.nameRu, qty: item.qty })),
      total: row.total,
    };
  }

  /** Tells the order's client, if there is one and Telegram reaches them. */
  async function tellClient(tx: Tx, row: OrderRow, notification: Notification) {
    if (!row.clientId) return;
    await outbox.tell(tx, row.clientId, notification, `${notification.type}:${row.id}`);
  }

  async function reasonOf(tx: DbOrTx, reasonId: string, audience: 'client' | 'staff' | 'system') {
    const [reason] = await tx.select().from(cancelReasons).where(eq(cancelReasons.id, reasonId));
    if (!reason || !reason.isActive) throw invalidAt('body.reasonId', 'no such reason');
    // A client picks the client's reasons; the staff may pick theirs and the client's.
    if (audience === 'client' && reason.appliesTo !== 'client') {
      throw invalidAt('body.reasonId', 'not a client reason');
    }
    if (audience === 'staff' && reason.appliesTo === 'system') {
      throw invalidAt('body.reasonId', 'a reason only the system gives');
    }
    return reason;
  }

  /** Cancels inside the transaction: the reserve goes back, the history and the client hear of it. */
  async function cancelInside(
    tx: Tx,
    row: OrderRow,
    who: 'client' | 'admin' | 'system',
    actorId: string | null,
    reason: typeof cancelReasons.$inferSelect,
    note: string | null,
  ): Promise<void> {
    if (!canTransition(row.status, 'cancelled', who)) {
      throw new AppError('invalid_transition', `${row.status} → cancelled`);
    }
    const now = clock.now();
    const updated = await tx
      .update(shopOrders)
      .set({
        status: 'cancelled',
        cancelledAt: now,
        cancelledBy: actorId,
        cancelReasonId: reason.id,
        cancelNote: note,
        holdUntil: null,
        pickupUntil: null,
        updatedAt: now,
      })
      .where(and(eq(shopOrders.id, row.id), eq(shopOrders.status, row.status)))
      .returning({ id: shopOrders.id });
    if (updated.length === 0) throw new AppError('invalid_transition', 'changed meanwhile');
    if (holdsReserve(row.status)) await stock.release(tx, await linesOf(tx, row.id));
    await recordStatus(tx, {
      entity: 'shop_order',
      entityId: row.id,
      from: row.status,
      to: 'cancelled',
      actorId,
      reasonId: reason.id,
      comment: note,
      at: now,
    });
    const facts = await factsOf(tx, row);
    const bilingual = { uz: reason.nameUz, ru: reason.nameRu };
    if (who === 'client') {
      const [client] = row.clientId
        ? await tx
            .select({ fullName: users.fullName })
            .from(users)
            .where(eq(users.id, row.clientId))
        : [];
      for (const to of await staff.recipients(tx, STAFF_ROLES)) {
        await outbox.enqueue(tx, {
          to,
          notification: {
            type: 'staff.shop_client_cancelled',
            ...facts,
            clientName: client?.fullName ?? '',
            reason: bilingual,
          },
          dedupeKey: `staff.shop_client_cancelled:${row.id}:${to.userId}`,
        });
      }
    } else {
      const { workshop: info } = await workshop.settings.current(tx);
      await tellClient(tx, row, {
        type: 'shop.cancelled',
        ...facts,
        reason: bilingual,
        workshopPhone: info.phone,
      });
    }
  }

  /** Prices the lines and writes a new order with them (inside the transaction). */
  async function insertOrder(
    tx: Tx,
    order: {
      status: 'new' | 'completed';
      source: 'tma' | 'counter';
      clientId: string | null;
      createdBy: string | null;
      requestId: string | null;
      comment: string | null;
      holdUntil: Date | null;
      lines: readonly CartLine[];
      at: Date;
    },
  ): Promise<OrderRow> {
    const offers = await stock.facts(
      tx,
      order.lines.map((line) => line.productId),
    );
    const priced = priceCart(order.lines, offers);
    const gone = priced.lines.filter((line) => line.problem === 'gone');
    if (gone.length > 0) {
      throw new AppError('validation', 'not on sale', {
        paths: gone.map((line) => `body.items.${line.productId}`),
      });
    }
    const [row] = await tx
      .insert(shopOrders)
      .values({
        status: order.status,
        source: order.source,
        clientId: order.clientId,
        subtotal: priced.subtotal,
        total: priced.subtotal,
        clientComment: order.comment,
        holdUntil: order.holdUntil,
        clientRequestId: order.requestId,
        createdBy: order.createdBy,
        completedAt: order.status === 'completed' ? order.at : null,
        createdAt: order.at,
      })
      .returning();
    if (!row) throw new Error('insert returned no row');
    await tx.insert(shopOrderItems).values(
      priced.lines.map((line) => ({
        shopOrderId: row.id,
        productId: line.productId,
        nameUz: line.offer?.nameUz ?? '',
        nameRu: line.offer?.nameRu ?? '',
        pack: line.offer?.pack ?? null,
        price: line.price,
        qty: line.qty,
        lineTotal: line.lineTotal,
      })),
    );
    return row;
  }

  // ---------------------------------------------------------------------------------------------
  // Scheduled: cancel what nobody confirmed in time and what nobody came for

  const expire: ScheduledTask = {
    name: 'shop-expire',
    async run(now) {
      const candidates = await db
        .select()
        .from(shopOrders)
        .where(inArray(shopOrders.status, ['new', 'ready_for_pickup']));
      for (const candidate of candidates) {
        const code = expiredReason(candidate, now);
        if (!code) continue;
        await db.transaction(async (tx) => {
          const row = await locked(tx, candidate.id);
          if (expiredReason(row, now) !== code) return;
          const [reason] = await tx
            .select()
            .from(cancelReasons)
            .where(eq(cancelReasons.code, code));
          if (!reason) throw new Error(`no cancel reason "${code}"`);
          await cancelInside(tx, row, 'system', null, reason, null);
        });
      }
    },
  };

  // ---------------------------------------------------------------------------------------------

  return {
    categories: () => stock.categories(),
    products: (query) => stock.catalog(query),
    product: (id) => stock.card(id),

    async quote(lines) {
      const merged = mergeLines(lines);
      const offers = await stock.facts(
        db,
        merged.map((line) => line.productId),
      );
      const priced = priceCart(merged, offers);
      const covers = await stock.covers(merged.map((line) => line.productId));
      return {
        lines: priced.lines.map((line) => ({
          productId: line.productId,
          nameUz: line.offer?.nameUz ?? '',
          nameRu: line.offer?.nameRu ?? '',
          pack: line.offer?.pack ?? null,
          photo: covers.get(line.productId) ?? null,
          price: line.price,
          qty: line.qty,
          lineTotal: line.lineTotal,
          availability: line.offer?.availability ?? 'out',
          maxQty: line.offer?.onSale ? line.offer.maxQty : 0,
          problem: line.problem,
        })),
        subtotal: priced.subtotal,
        canOrder: priced.canOrder,
      };
    },

    async create(actor, input) {
      requireVerifiedPhone(actor);
      const lines = mergeLines(input.items);
      const { rules } = await workshop.settings.current();
      const calendar = await workshop.hours.calendar();
      try {
        return await db.transaction(async (tx) => {
          // The same request again: the order it already made.
          const [earlier] = await tx
            .select()
            .from(shopOrders)
            .where(
              and(
                eq(shopOrders.clientId, actor.userId),
                eq(shopOrders.clientRequestId, input.requestId),
              ),
            );
          if (earlier) return ownView(tx, actor.userId, earlier.id);

          const now = clock.now();
          const row = await insertOrder(tx, {
            status: 'new',
            source: 'tma',
            clientId: actor.userId,
            createdBy: null,
            requestId: input.requestId,
            comment: input.comment,
            holdUntil: addWorkMinutes(calendar, now, rules.holdNewWorkMin),
            lines,
            at: now,
          });
          // All or nothing: one line short and the whole order goes back.
          await stock.reserve(tx, lines);
          await recordStatus(tx, {
            entity: 'shop_order',
            entityId: row.id,
            from: null,
            to: 'new',
            actorId: actor.userId,
            at: now,
          });
          const facts = await factsOf(tx, row);
          await outbox.enqueue(tx, {
            to: { userId: actor.userId, lang: actor.lang },
            notification: { type: 'shop.created', ...facts },
            dedupeKey: `shop.created:${row.id}`,
          });
          for (const to of await staff.recipients(tx, STAFF_ROLES)) {
            await outbox.enqueue(tx, {
              to,
              notification: { type: 'staff.shop_order_new', ...facts, clientName: actor.fullName },
              dedupeKey: `staff.shop_order_new:${row.id}:${to.userId}`,
            });
          }
          return ownView(tx, actor.userId, row.id);
        });
      } catch (error) {
        // The same request twice at once: the other one won, and its order is the answer.
        if (violatedUniqueConstraint(error) === 'shop_orders_client_request_unique') {
          const [winner] = await db
            .select({ id: shopOrders.id })
            .from(shopOrders)
            .where(
              and(
                eq(shopOrders.clientId, actor.userId),
                eq(shopOrders.clientRequestId, input.requestId),
              ),
            );
          if (winner) return ownView(db, actor.userId, winner.id);
        }
        throw error;
      }
    },

    async list(actor, tab) {
      const active = [...ACTIVE_SHOP_ORDER_STATUSES] as ShopOrderStatus[];
      const rows = await db
        .select()
        .from(shopOrders)
        .where(
          and(
            eq(shopOrders.clientId, actor.userId),
            tab === 'active'
              ? inArray(shopOrders.status, active)
              : notInArray(shopOrders.status, active),
          ),
        )
        .orderBy(desc(shopOrders.createdAt), desc(shopOrders.id));
      return clientViews(db, rows);
    },

    get: (actor, id) => ownView(db, actor.userId, id),

    async cancel(actor, id, input) {
      await ownRow(db, actor.userId, id);
      await db.transaction(async (tx) => {
        const row = await locked(tx, id);
        const reason = await reasonOf(tx, input.reasonId, 'client');
        if (reason.requiresText && !input.note) throw invalidAt('body.note', 'say why');
        await cancelInside(tx, row, 'client', actor.userId, reason, input.note ?? null);
      });
      return ownView(db, actor.userId, id);
    },

    async staffList(actor, query) {
      requirePermission(actor, 'shop.read');
      const term = query.q?.replace(/^№/, '').trim() ?? '';
      // A short number is an order's number: it names one order (the shop and the workshop share
      // the numbers), so it is looked for in every tab. Anything else is a name or a phone.
      const number = /^\d{1,7}$/.test(term) ? Number(term) : null;
      const escaped = term.replace(/[\\%_]/g, (m) => `\\${m}`);
      const digits = term.replace(/\D/g, '');
      const rows = await db
        .select({ order: shopOrders })
        .from(shopOrders)
        .leftJoin(users, eq(users.id, shopOrders.clientId))
        .where(
          number !== null
            ? eq(shopOrders.number, number)
            : and(
                inArray(shopOrders.status, [...TAB_STATUSES[query.tab]]),
                term
                  ? or(
                      ilike(users.fullName, `%${escaped}%`),
                      digits.length >= 3 ? ilike(users.phone, `%${digits}%`) : undefined,
                    )
                  : undefined,
              ),
        )
        .orderBy(
          query.tab === 'done' ? desc(shopOrders.updatedAt) : asc(shopOrders.createdAt),
          asc(shopOrders.id),
        )
        .limit(query.tab === 'done' ? 50 : 200);
      return staffViews(
        db,
        actor,
        rows.map((row) => row.order),
      );
    },

    async staffGet(actor, id) {
      requirePermission(actor, 'shop.read');
      return staffView(db, actor, id);
    },

    async call(actor, id, input, ip) {
      requirePermission(actor, 'shop.write');
      const { rules } = await workshop.settings.current();
      await db.transaction(async (tx) => {
        const row = await locked(tx, id);
        if (row.status !== 'new') throw new AppError('invalid_transition', `${row.status}: call`);
        const now = clock.now();
        await tx.insert(shopOrderCalls).values({
          shopOrderId: id,
          adminId: actor.userId,
          outcome: input.outcome,
          note: input.note ?? null,
          at: now,
        });
        if (input.outcome === 'no_answer') {
          await tx
            .update(shopOrders)
            .set({
              holdUntil: holdAfterNoAnswer(row.holdUntil, now, rules.holdNoAnswerHours),
              updatedAt: now,
            })
            .where(eq(shopOrders.id, id));
          return;
        }
        if (input.outcome === 'rejected') {
          if (!input.reasonId) throw invalidAt('body.reasonId', 'say why');
          const reason = await reasonOf(tx, input.reasonId, 'staff');
          if (reason.requiresText && !input.note) throw invalidAt('body.note', 'say why');
          await cancelInside(tx, row, 'admin', actor.userId, reason, input.note ?? null);
          return;
        }
        const updated = await tx
          .update(shopOrders)
          .set({
            status: 'confirmed',
            confirmedAt: now,
            confirmedBy: actor.userId,
            holdUntil: null,
            updatedAt: now,
          })
          .where(and(eq(shopOrders.id, id), eq(shopOrders.status, 'new')))
          .returning({ id: shopOrders.id });
        if (updated.length === 0) throw new AppError('invalid_transition', 'changed meanwhile');
        await recordStatus(tx, {
          entity: 'shop_order',
          entityId: id,
          from: 'new',
          to: 'confirmed',
          actorId: actor.userId,
          at: now,
        });
        await tellClient(tx, row, { type: 'shop.confirmed', ...(await factsOf(tx, row)) });
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'shop_order.confirm',
          entity: 'shop_order',
          entityId: id,
          ip: ip ?? null,
        });
      });
      return staffView(db, actor, id);
    },

    async ready(actor, id, ip) {
      requirePermission(actor, 'shop.write');
      const { workshop: info, rules } = await workshop.settings.current();
      await db.transaction(async (tx) => {
        const row = await locked(tx, id);
        if (!canTransition(row.status, 'ready_for_pickup', 'admin')) {
          throw new AppError('invalid_transition', `${row.status} → ready_for_pickup`);
        }
        const now = clock.now();
        const pickupUntil = pickupUntilOf(now, rules.shopPickupHours);
        await tx
          .update(shopOrders)
          .set({
            status: 'ready_for_pickup',
            readyAt: now,
            readyBy: actor.userId,
            pickupUntil,
            updatedAt: now,
          })
          .where(and(eq(shopOrders.id, id), eq(shopOrders.status, 'confirmed')));
        await recordStatus(tx, {
          entity: 'shop_order',
          entityId: id,
          from: 'confirmed',
          to: 'ready_for_pickup',
          actorId: actor.userId,
          at: now,
        });
        const when = presentInstant(pickupUntil);
        await tellClient(tx, row, {
          type: 'shop.ready',
          ...(await factsOf(tx, row)),
          pickupUntil: { date: when.date, time: when.time },
          address: info.address,
        });
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'shop_order.ready',
          entity: 'shop_order',
          entityId: id,
          ip: ip ?? null,
        });
      });
      return staffView(db, actor, id);
    },

    async staffCancel(actor, id, input, ip) {
      requirePermission(actor, 'shop.write');
      await db.transaction(async (tx) => {
        const row = await locked(tx, id);
        const reason = await reasonOf(tx, input.reasonId, 'staff');
        if (reason.requiresText && !input.note) throw invalidAt('body.note', 'say why');
        await cancelInside(tx, row, 'admin', actor.userId, reason, input.note ?? null);
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'shop_order.cancel',
          entity: 'shop_order',
          entityId: id,
          after: { reason: reason.code, note: input.note ?? null },
          ip: ip ?? null,
        });
      });
      return staffView(db, actor, id);
    },

    async setDiscount(actor, id, input, ip) {
      requirePermission(actor, 'checkout.write');
      const { rules } = await workshop.settings.current();
      await db.transaction(async (tx) => {
        const row = await locked(tx, id);
        if (!holdsReserve(row.status)) throw new AppError('invalid_transition', 'not open');
        const before = {
          amount: row.discountAmount,
          percent: row.discountPercent,
          reason: row.discountReason,
        };
        let next = { amount: 0, percent: null as number | null, reason: null as string | null };
        if (input.kind !== 'none') {
          const checked = checkDiscount({
            subtotal: row.subtotal,
            discount: input,
            limitPct: rules.adminDiscountLimitPct,
            unlimited: actor.permissions.has('discount.unlimited'),
          });
          if (!checked.ok) {
            throw checked.problem === 'over_limit'
              ? new AppError('discount_over_limit')
              : invalidAt('body.amount', 'more than the subtotal');
          }
          next = { ...checked.discount, reason: input.reason };
        }
        await tx
          .update(shopOrders)
          .set({
            discountAmount: next.amount,
            discountPercent: next.percent,
            discountReason: next.reason,
            discountBy: input.kind === 'none' ? null : actor.userId,
            total: row.subtotal - next.amount,
            updatedAt: clock.now(),
          })
          .where(eq(shopOrders.id, id));
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'shop_order.discount',
          entity: 'shop_order',
          entityId: id,
          before,
          after: next,
          ip: ip ?? null,
        });
      });
      return staffView(db, actor, id);
    },

    async checkout(actor, id, input, ip) {
      requirePermission(actor, 'checkout.write');
      await db.transaction(async (tx) => {
        // The order's lock first: a second checkout waits here and then sees the first one's result.
        const row = await locked(tx, id);
        const [earlier] = await tx
          .select({ shopOrderId: fiscalReceipts.shopOrderId })
          .from(fiscalReceipts)
          .where(eq(fiscalReceipts.requestId, input.requestId));
        if (earlier) {
          if (earlier.shopOrderId !== id) {
            throw invalidAt('body.requestId', 'this key was used for another order');
          }
          return;
        }
        if (!canTransition(row.status, 'completed', 'admin')) {
          throw new AppError('invalid_transition', `${row.status} → completed`);
        }
        const now = clock.now();
        const { receiptNo } = await kassa.recordInside(
          tx,
          actor,
          { kind: 'shop_order', id },
          { ...input, total: row.total },
        );
        await stock.sell(tx, {
          actorId: actor.userId,
          shopOrderId: id,
          lines: await linesOf(tx, id),
          fromReserve: true,
          at: now,
        });
        await tx
          .update(shopOrders)
          .set({ status: 'completed', completedAt: now, pickupUntil: null, updatedAt: now })
          .where(and(eq(shopOrders.id, id), eq(shopOrders.status, 'ready_for_pickup')));
        await recordStatus(tx, {
          entity: 'shop_order',
          entityId: id,
          from: 'ready_for_pickup',
          to: 'completed',
          actorId: actor.userId,
          at: now,
        });
        await tellClient(tx, row, { type: 'shop.completed', ...(await factsOf(tx, row)) });
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'shop_order.checkout',
          entity: 'shop_order',
          entityId: id,
          after: { total: row.total, payments: input.payments, receiptNo },
          ip: ip ?? null,
        });
      });
      return staffView(db, actor, id);
    },

    async quickSale(actor, input, ip) {
      requirePermission(actor, 'shop.write');
      requirePermission(actor, 'checkout.write');
      const lines = mergeLines(input.items);
      const id = await db.transaction(async (tx) => {
        // A new sale has no row to lock yet: the key itself is locked, so the same sale sent twice
        // at once waits here and then finds the first one's receipt.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`shop-sale:${input.requestId}`}))`,
        );
        // The same sale sent again: the order it already made.
        const [earlier] = await tx
          .select({ shopOrderId: fiscalReceipts.shopOrderId })
          .from(fiscalReceipts)
          .where(eq(fiscalReceipts.requestId, input.requestId));
        if (earlier) {
          if (!earlier.shopOrderId) throw invalidAt('body.requestId', 'used for another order');
          return earlier.shopOrderId;
        }
        if (input.clientId) {
          const [client] = await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, input.clientId));
          if (!client) throw invalidAt('body.clientId', 'no such client');
        }
        const now = clock.now();
        const row = await insertOrder(tx, {
          status: 'completed',
          source: 'counter',
          clientId: input.clientId,
          createdBy: actor.userId,
          requestId: null,
          comment: null,
          holdUntil: null,
          lines,
          at: now,
        });
        // From the free stock: what is reserved for other orders stays theirs.
        await stock.sell(tx, {
          actorId: actor.userId,
          shopOrderId: row.id,
          lines,
          fromReserve: false,
          at: now,
        });
        const paid = await kassa.recordInside(
          tx,
          actor,
          { kind: 'shop_order', id: row.id },
          {
            requestId: input.requestId,
            payments: input.payments,
            receiptNo: input.receiptNo,
            total: row.total,
          },
        );
        // The key lock above makes this impossible; were it to happen, nothing may be sold twice.
        if (!paid.recorded) throw new Error('quick sale: the receipt already exists');
        await recordStatus(tx, {
          entity: 'shop_order',
          entityId: row.id,
          from: null,
          to: 'completed',
          actorId: actor.userId,
          at: now,
        });
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'shop_order.quick_sale',
          entity: 'shop_order',
          entityId: row.id,
          after: { lines, total: row.total, payments: input.payments },
          ip: ip ?? null,
        });
        return row.id;
      });
      return staffView(db, actor, id);
    },

    async saleProducts(actor) {
      requirePermission(actor, 'shop.read');
      const items = await stock.catalog({ sort: 'price_asc' });
      const facts = await stock.facts(
        db,
        items.map((item) => item.id),
      );
      return items
        .map((item) => ({ ...item, free: facts.get(item.id)?.free ?? 0 }))
        .sort((a, b) => a.nameUz.localeCompare(b.nameUz));
    },

    async countsFor(actor) {
      if (!actor.permissions.has('shop.read')) return null;
      const rows = await db
        .select({ status: shopOrders.status, n: sql<number>`count(*)::int` })
        .from(shopOrders)
        .where(inArray(shopOrders.status, ['new', 'ready_for_pickup']))
        .groupBy(shopOrders.status);
      return {
        newOrders: rows.find((row) => row.status === 'new')?.n ?? 0,
        readyForPickup: rows.find((row) => row.status === 'ready_for_pickup')?.n ?? 0,
      };
    },

    tasks: [expire],
  };
}
