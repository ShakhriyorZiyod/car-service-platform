import type { AdminOrder, Availability, Slots, Today } from '@cs/shared';
import { compactPlate } from '@cs/shared/format';
import {
  ACTIVE_ORDER_STATUSES,
  type BodyClass,
  type CallOutcome,
  type OrderSource,
  type OrderStatus,
} from '@cs/shared/vocabulary';
import { and, asc, desc, eq, inArray, isNull, notInArray, or, sql, type SQL } from 'drizzle-orm';
import type { DbOrTx, Tx } from '../../../db/client';
import {
  cancelReasons,
  orderCalls,
  orderItems,
  orders,
  tasks,
  userRoles,
  users,
} from '../../../db/schema';
import { addDays, instantAt, localDateOf, weekdayOf } from '../../../lib/time';
import type { Notification } from '../../../notifications/types';
import { requirePermission, type StaffActor } from '../../../platform/actors';
import type { PlatformDeps } from '../../../platform/deps';
import { AppError, invalidAt } from '../../../platform/errors';
import type { Outbox } from '../../../platform/outbox';
import { recordStatus } from '../../../platform/status-history';
import type { AuditService } from '../../audit';
import type { BookingService, JobSpec } from '../../booking';
import type { OffersService } from '../../catalog';
import type { GarageService } from '../../garage';
import {
  createWorkTime,
  longestWorkdayMinutes,
  workMinutesBetween,
  type WorkshopService,
} from '../../workshop';
import { checkDiscount, countsTowardTotal, type DiscountInput } from '../domain/discount';
import { holdAfterNoAnswer, holdUntil as holdFor } from '../domain/hold';
import { canTransition, type OrderActor } from '../domain/order-status';
import { buildQuote, serviceTypesOf, type QuoteProblem, type ZoneOffer } from '../domain/quote';
import { handoverActions, noShowAllowed, staffActions } from '../domain/staff-actions';
import { retotal } from './totals';
import { createViews, instant, slotView, type OrderRow } from './views';

/**
 * The staff's orders (docs/PLAN.md, sections 8, 9.1, 10.4 and 12): the list and the order itself,
 * a call's outcome, changing the zones and the time, cancelling, "no show", an order entered by
 * hand, and the numbers of the "Today" screen.
 */

export interface AdminOrdersDeps extends PlatformDeps {
  workshop: Pick<WorkshopService, 'settings' | 'hours' | 'boxes'>;
  catalog: OffersService;
  garage: GarageService;
  booking: BookingService;
  outbox: Outbox;
  audit: AuditService;
}

export interface OrderFilter {
  from?: string | undefined;
  to?: string | undefined;
  serviceTypeId?: string | undefined;
  q?: string | undefined;
}

export interface ManualOrder {
  clientId: string;
  carId: string;
  serviceIds: readonly string[];
  startsAt: Date;
  source: Exclude<OrderSource, 'tma'>;
  comment?: string | null | undefined;
  confirmedByClient: boolean;
}

export interface CallInput {
  outcome: CallOutcome;
  reasonId?: string | null | undefined;
  note?: string | null | undefined;
}

/** A zone as a task sees it. */
export interface TaskItem {
  id: string;
  nameUz: string;
  nameRu: string;
  durationMin: number;
}

export interface ItemEdit {
  serviceId: string;
  /** Left out: the price list's (for a new zone) or the one already in the order. */
  price?: number | null | undefined;
  comment?: string | null | undefined;
}

/** What checkout needs to know of the order, read under its lock. */
export interface CheckoutState {
  status: OrderStatus;
  total: number;
  /** Zones that count and have no price. */
  unpricedCount: number;
}

export interface AdminOrdersService {
  list(actor: StaffActor, filter: OrderFilter): Promise<AdminOrder[]>;
  get(actor: StaffActor, id: string): Promise<AdminOrder>;
  create(actor: StaffActor, input: ManualOrder, ip?: string): Promise<AdminOrder>;
  call(actor: StaffActor, id: string, input: CallInput): Promise<AdminOrder>;
  updateItems(
    actor: StaffActor,
    id: string,
    items: readonly ItemEdit[],
    ip?: string,
  ): Promise<AdminOrder>;
  reschedule(actor: StaffActor, id: string, startsAt: Date, ip?: string): Promise<AdminOrder>;
  cancel(
    actor: StaffActor,
    id: string,
    input: { reasonId: string; note?: string | null | undefined },
    ip?: string,
  ): Promise<AdminOrder>;
  noShow(actor: StaffActor, id: string, ip?: string): Promise<AdminOrder>;
  /**
   * The discount on the whole order, with a reason; `null` takes it off (docs/PLAN.md, section 11).
   * An admin up to the workshop's limit, the owner up to the subtotal.
   */
  setDiscount(
    actor: StaffActor,
    id: string,
    discount: { input: DiscountInput; reason: string } | null,
    ip?: string,
  ): Promise<AdminOrder>;
  /** A price for a zone "to be agreed", once the work began; it is fixed from then on. */
  priceItem(
    actor: StaffActor,
    id: string,
    itemId: string,
    price: number,
    ip?: string,
  ): Promise<AdminOrder>;
  /** Locks the order for checkout, inside the caller's transaction, and says where it stands. */
  checkoutState(tx: Tx, id: string): Promise<CheckoutState>;
  /**
   * The car was handed over and paid for: the order becomes "completed" and the client is asked
   * to rate the work. Inside the caller's transaction, which has checked everything else.
   */
  completeInside(tx: Tx, actor: StaffActor, id: string, receiptNo: string): Promise<void>;
  /**
   * The order goes to "in work", inside the caller's transaction (docs/PLAN.md, section 9.1). The
   * reception module has checked the permission and that the client confirmed the act.
   */
  startWorkInside(tx: Tx, actor: StaffActor, id: string): Promise<void>;
  /**
   * The zones a master may be given, inside the caller's transaction: the order is in work, and
   * each zone is the order's, approved and in no task yet. Gives their names and norms.
   */
  itemsForTask(tx: Tx, orderId: string, itemIds: readonly string[]): Promise<TaskItem[]>;
  /** Ties zones to a task that was just made (the caller made it in the same transaction). */
  attachItems(tx: Tx, itemIds: readonly string[], taskId: string): Promise<void>;
  /**
   * A task was accepted or extra work was answered: when every approved zone is in an accepted
   * task and nothing waits for the client, the order becomes "ready for pickup" by itself and its
   * booking is cut short (docs/PLAN.md, section 9.1).
   */
  onTasksChanged(tx: Tx, orderId: string): Promise<void>;
  availability(
    actor: StaffActor,
    input: { bodyClass: BodyClass; serviceIds: readonly string[] },
  ): Promise<Availability>;
  slots(
    actor: StaffActor,
    input: {
      bodyClass: BodyClass;
      serviceIds: readonly string[];
      date: string;
      exceptOrderId?: string | undefined;
    },
  ): Promise<Slots>;
  today(actor: StaffActor): Promise<Today>;
  /** A client's orders, newest first, for their card. */
  forClient(actor: StaffActor, clientId: string, limit: number): Promise<AdminOrder[]>;
  /** Erases the plate in the orders' car copies of an erased client (TZ 15.3); the orders stay. */
  anonymize(tx: Tx, clientId: string): Promise<void>;
  /** The reasons a staff member may give for cancelling or rejecting. */
  cancelReasons(
    actor: StaffActor,
  ): Promise<{ id: string; nameUz: string; nameRu: string; requiresText: boolean }[]>;
}

const PROBLEM_CODE: Record<QuoteProblem, 'validation' | 'service_unavailable'> = {
  nothing_chosen: 'validation',
  unknown_zone: 'validation',
  zone_not_in_use: 'service_unavailable',
  not_offered_for_class: 'service_unavailable',
  zones_exclude_each_other: 'service_unavailable',
};

/**
 * Where the order is on the calendar: the start of the booking it holds now, or of the last one it
 * held. A booking given back when the order was moved is older and does not count, however late it
 * was for.
 */
const currentStart = sql`(select b.starts_at from bookings b where b.order_id = ${orders.id} order by (b.released_at is null) desc, b.created_at desc, b.id desc limit 1)`;

const NO_ACTIONS = {
  canCall: false,
  canEditItems: false,
  canReschedule: false,
  canCancel: false,
  canNoShow: false,
  canDiscount: false,
  canPriceItems: false,
  canCheckout: false,
} as const;

const kindOf = (actor: StaffActor): Extract<OrderActor, 'admin' | 'owner'> =>
  actor.roles.includes('owner') ? 'owner' : 'admin';

/** `%` and `_` typed by a person must not act as wildcards. */
const likeEscape = (text: string): string => text.replace(/[\\%_]/g, (char) => `\\${char}`);

export function createAdminOrdersService(deps: AdminOrdersDeps): AdminOrdersService {
  const { db, clock, workshop, catalog, garage, booking, outbox, audit } = deps;
  const { viewsOf, factsOf, bookingOf } = createViews(booking);

  /** Prices zones for a body class: reads only, with the connection it is given. */
  async function price(
    from: DbOrTx,
    bodyClass: BodyClass,
    serviceIds: readonly string[],
    /** Zones already in the order keep what they were sold for. */
    keep: ReadonlyMap<string, { price: number | null; durationMin: number }> = new Map(),
  ) {
    const settings = await workshop.settings.current(from);
    const calendar = await workshop.hours.calendar(from);
    const found = await catalog.offers(serviceIds, bodyClass, from);
    const offers: ZoneOffer[] = found.map((offer) => {
      const stored = keep.get(offer.serviceId);
      return stored ? { ...offer, isActive: true, cell: stored } : offer;
    });
    const result = buildQuote(serviceIds, offers, {
      bufferMin: settings.rules.bufferMin,
      longestWorkdayMin: longestWorkdayMinutes(calendar),
    });
    if (!result.ok) {
      throw new AppError(PROBLEM_CODE[result.problem], result.problem, {
        paths: ['body.serviceIds'],
      });
    }
    const job: JobSpec = {
      serviceTypeIds: serviceTypesOf(result.quote),
      workMinutes: result.quote.totalMinutes,
    };
    return {
      quote: result.quote,
      job,
      rules: settings.rules,
      calendar,
      workshopPhone: settings.workshop.phone,
    };
  }

  /** The client's row, for a message and for the order's card. */
  async function clientRow(from: DbOrTx, id: string) {
    const [row] = await from.select().from(users).where(eq(users.id, id));
    if (!row) throw new AppError('not_found');
    return row;
  }

  /** Told in Telegram, if they have it: a client entered by phone has none, and that is no error. */
  async function tell(
    tx: DbOrTx,
    clientId: string,
    notification: Notification,
    dedupeKey: string,
  ): Promise<void> {
    const client = await clientRow(tx, clientId);
    if (client.telegramId === null) return;
    await outbox.enqueue(tx, {
      to: { userId: client.id, lang: client.lang },
      notification,
      dedupeKey,
    });
  }

  async function lockedOrder(tx: DbOrTx, id: string): Promise<OrderRow> {
    const [row] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
    if (!row) throw new AppError('not_found');
    return row;
  }

  /** The orders as the staff see them. */
  async function adminViews(
    from: DbOrTx,
    actor: StaffActor,
    rows: readonly OrderRow[],
  ): Promise<AdminOrder[]> {
    if (rows.length === 0) return [];
    const now = clock.now();
    const base = await viewsOf(from, rows);
    const ids = rows.map((row) => row.id);
    const items = await from
      .select()
      .from(orderItems)
      .where(inArray(orderItems.orderId, ids))
      .orderBy(asc(orderItems.createdAt), asc(orderItems.id));
    const callRows = await from
      .select({
        id: orderCalls.id,
        orderId: orderCalls.orderId,
        outcome: orderCalls.outcome,
        note: orderCalls.note,
        at: orderCalls.at,
        adminName: users.fullName,
      })
      .from(orderCalls)
      .innerJoin(users, eq(users.id, orderCalls.adminId))
      .where(inArray(orderCalls.orderId, ids))
      .orderBy(asc(orderCalls.at));
    const clients = await from
      .select()
      .from(users)
      .where(inArray(users.id, [...new Set(rows.map((row) => row.clientId))]));
    const reasonIds = rows.flatMap((row) => (row.cancelReasonId ? [row.cancelReasonId] : []));
    const reasons =
      reasonIds.length === 0
        ? []
        : await from.select().from(cancelReasons).where(inArray(cancelReasons.id, reasonIds));
    const { rules } = await workshop.settings.current(from);
    const calendar = await workshop.hours.calendar(from);

    return rows.map((row, index) => {
      const view = base[index];
      if (!view) throw new Error('a view is missing');
      const calls = callRows.filter((call) => call.orderId === row.id);
      const client = clients.find((candidate) => candidate.id === row.clientId);
      const reason = reasons.find((candidate) => candidate.id === row.cancelReasonId);
      const waiting =
        row.status === 'new' && calls.length === 0
          ? workMinutesBetween(calendar, row.createdAt, now)
          : null;
      return {
        ...view,
        items: view.items.map((item) => {
          const stored = items.find((candidate) => candidate.id === item.id);
          return {
            ...item,
            serviceId: stored?.serviceId ?? '',
            comment: stored?.comment ?? null,
            taskId: stored?.taskId ?? null,
          };
        }),
        source: row.source,
        client: {
          id: row.clientId,
          fullName: client?.fullName ?? '',
          phone: client?.phone ?? null,
          hasTelegram: client?.telegramId != null,
        },
        carId: row.carId,
        bodyClass: row.bodyClass,
        createdAt: instant(row.createdAt),
        waitingMin: waiting,
        callWarn: waiting !== null && waiting >= rules.callWarnMin,
        calls: calls.map((call) => ({
          id: call.id,
          outcome: call.outcome,
          note: call.note,
          at: instant(call.at),
          adminName: call.adminName,
        })),
        cancelReason: reason ? { uz: reason.nameUz, ru: reason.nameRu } : null,
        // Who may only read is shown no buttons: the panel offers what the server says.
        actions: actor.permissions.has('orders.write')
          ? {
              ...staffActions({
                status: row.status,
                startsAt: new Date(view.startsAt.at),
                now,
                by: kindOf(actor),
              }),
              ...handoverActions({
                status: row.status,
                unpricedCount: view.unpricedCount,
                maySettle: actor.permissions.has('checkout.write'),
              }),
            }
          : NO_ACTIONS,
      };
    });
  }

  async function oneView(from: DbOrTx, actor: StaffActor, id: string): Promise<AdminOrder> {
    const [row] = await from.select().from(orders).where(eq(orders.id, id));
    if (!row) throw new AppError('not_found');
    const [view] = await adminViews(from, actor, [row]);
    if (!view) throw new AppError('not_found');
    return view;
  }

  /** A reason a staff member may give: one meant for clients or one meant for the staff. */
  async function staffReason(
    tx: DbOrTx,
    reasonId: string | null | undefined,
    note: string | null | undefined,
  ) {
    if (!reasonId) throw invalidAt('body.reasonId', 'a reason is required');
    const [reason] = await tx.select().from(cancelReasons).where(eq(cancelReasons.id, reasonId));
    if (!reason?.isActive || reason.appliesTo === 'system') {
      throw invalidAt('body.reasonId', 'not a reason the staff may give');
    }
    const text = note?.trim() || null;
    if (reason.requiresText && text === null)
      throw invalidAt('body.note', 'this reason needs words');
    return { reason, text };
  }

  /** Cancels inside the transaction: status, box, history and the message to the client. */
  async function cancelInside(
    tx: Tx,
    actor: StaffActor,
    locked: OrderRow,
    reason: typeof cancelReasons.$inferSelect,
    text: string | null,
    workshopPhone: string | null,
  ): Promise<void> {
    const now = clock.now();
    if (!canTransition(locked.status, 'cancelled', kindOf(actor))) {
      throw new AppError('invalid_transition', `${locked.status} → cancelled`);
    }
    const [updated] = await tx
      .update(orders)
      .set({
        status: 'cancelled',
        cancelledAt: now,
        cancelledBy: actor.userId,
        cancelReasonId: reason.id,
        cancelNote: text,
        holdUntil: null,
        updatedAt: now,
      })
      .where(and(eq(orders.id, locked.id), eq(orders.status, locked.status)))
      .returning();
    if (!updated) throw new AppError('invalid_transition');
    const reservation = await bookingOf(tx, locked.id);
    await booking.release(tx, locked.id, 'cancelled');
    await recordStatus(tx, {
      entity: 'order',
      entityId: locked.id,
      from: locked.status,
      to: 'cancelled',
      actorId: actor.userId,
      reasonId: reason.id,
      comment: text,
      at: now,
    });
    await tell(
      tx,
      locked.clientId,
      {
        type: 'order.cancelled',
        ...(await factsOf(tx, updated, reservation)),
        reason: { uz: reason.nameUz, ru: reason.nameRu },
        workshopPhone,
      },
      `order.cancelled:${locked.id}`,
    );
  }

  return {
    async list(actor, filter) {
      requirePermission(actor, 'orders.read');
      const today = localDateOf(clock.now());
      const from = instantAt(filter.from ?? today, '00:00');
      const to = instantAt(addDays(filter.to ?? filter.from ?? today, 1), '00:00');
      const startsAt = currentStart;

      const conditions: SQL[] = [
        // Everything in progress is listed; the finished ones only for the days asked.
        or(
          inArray(orders.status, [...ACTIVE_ORDER_STATUSES] as OrderStatus[]),
          and(sql`${startsAt} >= ${from}`, sql`${startsAt} < ${to}`),
        ) as SQL,
      ];
      if (filter.serviceTypeId) {
        conditions.push(
          sql`exists (select 1 from order_items i where i.order_id = ${orders.id} and i.service_type_id = ${filter.serviceTypeId})`,
        );
      }
      if (filter.q) {
        const text = likeEscape(filter.q);
        const digits = filter.q.replace(/\D/g, '');
        const plate = likeEscape(compactPlate(filter.q));
        const number = /^\d{1,9}$/.test(filter.q.trim()) ? Number(filter.q.trim()) : null;
        conditions.push(
          or(
            number === null ? sql`false` : sql`${orders.number} = ${number}`,
            sql`${orders.carSnapshot}->>'plate' like ${`%${plate}%`}`,
            sql`exists (select 1 from users u where u.id = ${orders.clientId} and (u.full_name ilike ${`%${text}%`} or (${digits} <> '' and u.phone like ${`%${digits}%`})))`,
          ) as SQL,
        );
      }

      const rows = await db
        .select()
        .from(orders)
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt), desc(orders.id))
        .limit(300);
      return adminViews(db, actor, rows);
    },

    async get(actor, id) {
      requirePermission(actor, 'orders.read');
      return oneView(db, actor, id);
    },

    async create(actor, input, ip) {
      requirePermission(actor, 'orders.write');
      const client = await clientRow(db, input.clientId);
      if (client.anonymizedAt !== null) throw new AppError('not_found');
      const staffRole = await db
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(eq(userRoles.userId, client.id))
        .limit(1);
      if (staffRole.length > 0) throw new AppError('not_found');

      const { car, label } = await garage.own(client.id, input.carId, db);
      const priced = await price(db, car.bodyClass, input.serviceIds);

      return db.transaction(async (tx) => {
        const now = clock.now();
        const confirmed = input.confirmedByClient;
        const hold = confirmed
          ? null
          : holdFor(createWorkTime(priced.calendar), now, priced.rules.holdNewWorkMin);
        const [order] = await tx
          .insert(orders)
          .values({
            status: confirmed ? 'confirmed' : 'new',
            source: input.source,
            clientId: client.id,
            carId: car.id,
            carSnapshot: {
              label,
              brand: car.brand,
              model: car.model,
              year: car.year,
              plate: car.plate,
              color: car.color,
              bodyClass: car.bodyClass,
            },
            bodyClass: car.bodyClass,
            clientComment: input.comment ?? null,
            subtotal: priced.quote.subtotal,
            discountAmount: 0,
            total: priced.quote.subtotal,
            holdUntil: hold,
            confirmedAt: confirmed ? now : null,
            confirmedBy: confirmed ? actor.userId : null,
            createdBy: actor.userId,
            createdAt: now,
          })
          .returning();
        if (!order) throw new Error('insert returned no row');

        await tx.insert(orderItems).values(
          priced.quote.lines.map((line) => ({
            orderId: order.id,
            serviceId: line.serviceId,
            serviceTypeId: line.serviceTypeId,
            nameUz: line.nameUz,
            nameRu: line.nameRu,
            typeNameUz: line.typeNameUz,
            typeNameRu: line.typeNameRu,
            bodyClass: car.bodyClass,
            price: line.price,
            durationMin: line.durationMin,
            createdBy: actor.userId,
          })),
        );
        // A client at the door or on the phone: staff may book sooner than the lead time.
        const reservation = await booking.reserve(tx, {
          orderId: order.id,
          startsAt: input.startsAt,
          job: priced.job,
          createdBy: actor.userId,
          waiveLead: true,
        });
        await recordStatus(tx, {
          entity: 'order',
          entityId: order.id,
          from: null,
          to: order.status,
          actorId: actor.userId,
          at: now,
        });

        const facts = await factsOf(tx, order, reservation);
        await tell(
          tx,
          client.id,
          confirmed ? { type: 'order.confirmed', ...facts } : { type: 'order.created', ...facts },
          `${confirmed ? 'order.confirmed' : 'order.created'}:${order.id}`,
        );
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'order.create',
          entity: 'order',
          entityId: order.id,
          after: {
            number: order.number,
            source: input.source,
            status: order.status,
            clientId: client.id,
            total: order.total,
          },
          ip: ip ?? null,
        });
        return oneView(tx, actor, order.id);
      });
    },

    async call(actor, id, input) {
      requirePermission(actor, 'orders.write');
      const settings = await workshop.settings.current();

      return db.transaction(async (tx) => {
        const now = clock.now();
        const locked = await lockedOrder(tx, id);

        if (input.outcome === 'no_answer') {
          if (locked.status !== 'new') throw new AppError('invalid_transition');
          await tx
            .update(orders)
            .set({
              holdUntil: holdAfterNoAnswer(locked.holdUntil, now, settings.rules.holdNoAnswerHours),
              updatedAt: now,
            })
            .where(eq(orders.id, id));
        } else if (input.outcome === 'confirmed') {
          if (!canTransition(locked.status, 'confirmed', kindOf(actor))) {
            throw new AppError('invalid_transition', `${locked.status} → confirmed`);
          }
          const [updated] = await tx
            .update(orders)
            .set({
              status: 'confirmed',
              confirmedAt: now,
              confirmedBy: actor.userId,
              holdUntil: null,
              updatedAt: now,
            })
            .where(and(eq(orders.id, id), eq(orders.status, 'new')))
            .returning();
          if (!updated) throw new AppError('invalid_transition');
          await recordStatus(tx, {
            entity: 'order',
            entityId: id,
            from: 'new',
            to: 'confirmed',
            actorId: actor.userId,
            at: now,
          });
          await tell(
            tx,
            locked.clientId,
            { type: 'order.confirmed', ...(await factsOf(tx, updated, await bookingOf(tx, id))) },
            `order.confirmed:${id}`,
          );
        } else {
          if (locked.status !== 'new') throw new AppError('invalid_transition');
          const { reason, text } = await staffReason(tx, input.reasonId, input.note);
          await cancelInside(tx, actor, locked, reason, text, settings.workshop.phone);
        }

        await tx.insert(orderCalls).values({
          orderId: id,
          adminId: actor.userId,
          outcome: input.outcome,
          note: input.note?.trim() || null,
          at: now,
        });
        return oneView(tx, actor, id);
      });
    },

    async updateItems(actor, id, edits, ip) {
      requirePermission(actor, 'orders.write');
      const ids = edits.map((edit) => edit.serviceId);
      if (new Set(ids).size !== ids.length) throw invalidAt('body.items', 'a zone twice');

      return db.transaction(async (tx) => {
        const locked = await lockedOrder(tx, id);
        const reservation = await bookingOf(tx, id);
        if (
          !staffActions({
            status: locked.status,
            startsAt: reservation.startsAt,
            now: clock.now(),
            by: kindOf(actor),
          }).canEditItems
        ) {
          throw new AppError('invalid_transition', 'the work has started');
        }

        const current = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
        const keep = new Map(
          current.map((item) => [
            item.serviceId,
            { price: item.price, durationMin: item.durationMin },
          ]),
        );
        const priced = await price(tx, locked.bodyClass, ids, keep);

        // The price a person typed wins over the list's; a zone left as it was keeps its price.
        const lines = priced.quote.lines.map((line) => {
          const edit = edits.find((candidate) => candidate.serviceId === line.serviceId);
          return { ...line, price: edit?.price === undefined ? line.price : edit.price, edit };
        });
        const before = current.map((item) => ({
          serviceId: item.serviceId,
          price: item.price,
          durationMin: item.durationMin,
        }));

        for (const line of lines) {
          const existing = current.find((item) => item.serviceId === line.serviceId);
          if (existing) {
            await tx
              .update(orderItems)
              .set({
                price: line.price,
                comment: line.edit?.comment === undefined ? existing.comment : line.edit.comment,
              })
              .where(eq(orderItems.id, existing.id));
          } else {
            await tx.insert(orderItems).values({
              orderId: id,
              serviceId: line.serviceId,
              serviceTypeId: line.serviceTypeId,
              nameUz: line.nameUz,
              nameRu: line.nameRu,
              typeNameUz: line.typeNameUz,
              typeNameRu: line.typeNameRu,
              bodyClass: locked.bodyClass,
              price: line.price,
              durationMin: line.durationMin,
              comment: line.edit?.comment ?? null,
              createdBy: actor.userId,
            });
          }
        }
        const removed = current.filter((item) => !ids.includes(item.serviceId));
        if (removed.length > 0) {
          await tx.delete(orderItems).where(
            inArray(
              orderItems.id,
              removed.map((item) => item.id),
            ),
          );
        }

        // The discount follows the new subtotal: a percentage again, an amount at most (PLAN 11).
        const { subtotal } = await retotal(tx, id, clock.now());

        // The box is held for the new length from the same start; if that no longer fits, the
        // whole change fails with slot_taken and nothing is changed.
        await booking.rebook(tx, {
          orderId: id,
          startsAt: reservation.startsAt,
          job: priced.job,
          createdBy: actor.userId,
          keepStart: true,
        });
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'order.items.update',
          entity: 'order',
          entityId: id,
          before: { subtotal: locked.subtotal, items: before },
          after: {
            subtotal,
            items: lines.map((line) => ({
              serviceId: line.serviceId,
              price: line.price,
              durationMin: line.durationMin,
            })),
          },
          ip: ip ?? null,
        });
        return oneView(tx, actor, id);
      });
    },

    async reschedule(actor, id, startsAt, ip) {
      requirePermission(actor, 'orders.write');
      return db.transaction(async (tx) => {
        const now = clock.now();
        const locked = await lockedOrder(tx, id);
        const previous = await bookingOf(tx, id);
        if (
          !staffActions({
            status: locked.status,
            startsAt: previous.startsAt,
            now,
            by: kindOf(actor),
          }).canReschedule
        ) {
          throw new AppError('invalid_transition');
        }

        const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
        const keep = new Map(
          items.map((item) => [
            item.serviceId,
            { price: item.price, durationMin: item.durationMin },
          ]),
        );
        const priced = await price(
          tx,
          locked.bodyClass,
          items.map((item) => item.serviceId),
          keep,
        );
        // The old booking is given back first, so it never blocks its own new time; when nothing
        // is free the whole change is undone and the order stays where it was.
        const moved = await booking.rebook(tx, {
          orderId: id,
          startsAt,
          job: priced.job,
          createdBy: actor.userId,
          waiveLead: true,
        });
        const [updated] = await tx
          .update(orders)
          .set({ rescheduleRequestedAt: null, updatedAt: now })
          .where(eq(orders.id, id))
          .returning();
        if (!updated) throw new AppError('not_found');

        await tell(
          tx,
          locked.clientId,
          {
            type: 'order.rescheduled',
            ...(await factsOf(tx, updated, moved)),
            previousStartsAt: {
              date: instant(previous.startsAt).date,
              time: instant(previous.startsAt).time,
            },
          },
          `order.rescheduled:${id}:${moved.startsAt.toISOString()}`,
        );
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'order.reschedule',
          entity: 'order',
          entityId: id,
          before: { startsAt: previous.startsAt.toISOString(), box: previous.boxName },
          after: { startsAt: moved.startsAt.toISOString(), box: moved.boxName },
          ip: ip ?? null,
        });
        return oneView(tx, actor, id);
      });
    },

    async cancel(actor, id, input, ip) {
      requirePermission(actor, 'orders.write');
      const settings = await workshop.settings.current();
      return db.transaction(async (tx) => {
        const locked = await lockedOrder(tx, id);
        // Work in progress is the owner's to cancel (PLAN 8); the transition table says so too.
        if (locked.status === 'in_work') requirePermission(actor, 'orders.cancel_in_work');
        const { reason, text } = await staffReason(tx, input.reasonId, input.note);
        await cancelInside(tx, actor, locked, reason, text, settings.workshop.phone);
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'order.cancel',
          entity: 'order',
          entityId: id,
          before: { status: locked.status },
          after: { status: 'cancelled', reason: reason.code, note: text },
          ip: ip ?? null,
        });
        return oneView(tx, actor, id);
      });
    },

    async setDiscount(actor, id, discount, ip) {
      requirePermission(actor, 'checkout.write');
      const { rules } = await workshop.settings.current();
      return db.transaction(async (tx) => {
        const now = clock.now();
        const locked = await lockedOrder(tx, id);
        const allowed = handoverActions({
          status: locked.status,
          unpricedCount: 0,
          maySettle: true,
        });
        if (!allowed.canDiscount) throw new AppError('invalid_transition');

        let next = { amount: 0, percent: null as number | null, reason: null as string | null };
        if (discount !== null) {
          const checked = checkDiscount({
            subtotal: locked.subtotal,
            discount: discount.input,
            limitPct: rules.adminDiscountLimitPct,
            unlimited: actor.permissions.has('discount.unlimited'),
          });
          if (!checked.ok) {
            const path = discount.input.kind === 'percent' ? 'body.percent' : 'body.amount';
            if (checked.problem === 'over_limit') {
              throw new AppError('discount_over_limit', 'above the admin limit', { paths: [path] });
            }
            throw invalidAt(path, 'more than the subtotal');
          }
          next = { ...checked.discount, reason: discount.reason.trim() };
        }
        await tx
          .update(orders)
          .set({
            discountAmount: next.amount,
            discountPercent: next.percent,
            discountReason: next.reason,
            discountBy: discount === null ? null : actor.userId,
            total: locked.subtotal - next.amount,
            updatedAt: now,
          })
          .where(eq(orders.id, id));
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'order.discount',
          entity: 'order',
          entityId: id,
          before: {
            amount: locked.discountAmount,
            percent: locked.discountPercent,
            reason: locked.discountReason,
          },
          after: {
            amount: next.amount,
            percent: next.percent,
            reason: next.reason,
            subtotal: locked.subtotal,
          },
          ip: ip ?? null,
        });
        return oneView(tx, actor, id);
      });
    },

    async priceItem(actor, id, itemId, price, ip) {
      requirePermission(actor, 'orders.write');
      return db.transaction(async (tx) => {
        const now = clock.now();
        const locked = await lockedOrder(tx, id);
        const [item] = await tx
          .select()
          .from(orderItems)
          .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, id)));
        if (!item) throw new AppError('not_found');
        // Before the work the zones are edited as a whole; after it only a missing price is set.
        if (
          (locked.status !== 'in_work' && locked.status !== 'ready_for_pickup') ||
          item.price !== null ||
          item.approval === 'rejected'
        ) {
          throw new AppError('invalid_transition');
        }
        const [priced] = await tx
          .update(orderItems)
          .set({ price })
          .where(and(eq(orderItems.id, itemId), isNull(orderItems.price)))
          .returning({ id: orderItems.id });
        if (!priced) throw new AppError('invalid_transition');
        const sums = await retotal(tx, id, now);
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'order.item.price',
          entity: 'order',
          entityId: id,
          before: { itemId, price: null, total: locked.total },
          after: { itemId, price, total: sums.total },
          ip: ip ?? null,
        });
        return oneView(tx, actor, id);
      });
    },

    async checkoutState(tx, id) {
      const locked = await lockedOrder(tx, id);
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
      return {
        status: locked.status,
        total: locked.total,
        unpricedCount: items.filter((item) => countsTowardTotal(item) && item.price === null)
          .length,
      };
    },

    async completeInside(tx, actor, id, receiptNo) {
      const now = clock.now();
      const locked = await lockedOrder(tx, id);
      if (!canTransition(locked.status, 'completed', kindOf(actor))) {
        throw new AppError('invalid_transition');
      }
      const [updated] = await tx
        .update(orders)
        .set({ status: 'completed', completedAt: now, updatedAt: now })
        .where(and(eq(orders.id, id), eq(orders.status, 'ready_for_pickup')))
        .returning({ id: orders.id });
      if (!updated) throw new AppError('invalid_transition');
      await recordStatus(tx, {
        entity: 'order',
        entityId: id,
        from: 'ready_for_pickup',
        to: 'completed',
        actorId: actor.userId,
        at: now,
      });
      const snapshot = locked.carSnapshot as { label: string; plate: string };
      await tell(
        tx,
        locked.clientId,
        {
          type: 'order.completed',
          orderId: id,
          number: locked.number,
          car: snapshot.label,
          plate: snapshot.plate,
          total: locked.total,
          receiptNo,
        },
        `completed:${id}`,
      );
    },

    async startWorkInside(tx, actor, id) {
      const now = clock.now();
      const locked = await lockedOrder(tx, id);
      if (!canTransition(locked.status, 'in_work', kindOf(actor))) {
        throw new AppError('invalid_transition');
      }
      const [updated] = await tx
        .update(orders)
        .set({ status: 'in_work', workStartedAt: now, updatedAt: now })
        .where(and(eq(orders.id, id), eq(orders.status, 'confirmed')))
        .returning({ id: orders.id });
      if (!updated) throw new AppError('invalid_transition');
      await recordStatus(tx, {
        entity: 'order',
        entityId: id,
        from: 'confirmed',
        to: 'in_work',
        actorId: actor.userId,
        at: now,
      });
    },

    async itemsForTask(tx, orderId, itemIds) {
      const locked = await lockedOrder(tx, orderId);
      if (locked.status !== 'in_work') throw new AppError('invalid_transition');
      const wanted = [...new Set(itemIds)];
      const rows =
        wanted.length === 0
          ? []
          : await tx
              .select()
              .from(orderItems)
              .where(and(eq(orderItems.orderId, orderId), inArray(orderItems.id, wanted)))
              .orderBy(asc(orderItems.createdAt), asc(orderItems.id));
      // An id that is not this order's, an unanswered or refused extra, or a zone already in a
      // task: none of them can be given out.
      const usable = rows.filter(
        (item) =>
          item.taskId === null &&
          (item.approval === 'not_required' || item.approval === 'approved'),
      );
      if (wanted.length === 0 || usable.length !== wanted.length) {
        throw new AppError('item_unavailable');
      }
      return usable.map((item) => ({
        id: item.id,
        nameUz: item.nameUz,
        nameRu: item.nameRu,
        durationMin: item.durationMin,
      }));
    },

    async attachItems(tx, itemIds, taskId) {
      if (itemIds.length === 0) return;
      await tx
        .update(orderItems)
        .set({ taskId })
        .where(and(inArray(orderItems.id, [...itemIds]), isNull(orderItems.taskId)));
    },

    async onTasksChanged(tx, orderId) {
      const now = clock.now();
      const locked = await lockedOrder(tx, orderId);
      if (locked.status !== 'in_work') return;
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      // Extra work the client has not answered holds the order back.
      if (items.some((item) => item.approval === 'pending')) return;
      const active = items.filter(
        (item) => item.approval === 'not_required' || item.approval === 'approved',
      );
      if (active.length === 0) return;
      const taskIds = [...new Set(active.flatMap((item) => (item.taskId ? [item.taskId] : [])))];
      const accepted =
        taskIds.length === 0
          ? []
          : await tx
              .select({ id: tasks.id })
              .from(tasks)
              .where(and(inArray(tasks.id, taskIds), eq(tasks.status, 'accepted')));
      const acceptedIds = new Set(accepted.map((task) => task.id));
      if (!active.every((item) => item.taskId !== null && acceptedIds.has(item.taskId))) return;

      const [updated] = await tx
        .update(orders)
        .set({ status: 'ready_for_pickup', readyAt: now, updatedAt: now })
        .where(and(eq(orders.id, orderId), eq(orders.status, 'in_work')))
        .returning({ id: orders.id });
      if (!updated) return;
      await booking.shorten(tx, orderId);
      await recordStatus(tx, {
        entity: 'order',
        entityId: orderId,
        from: 'in_work',
        to: 'ready_for_pickup',
        actorId: null,
        at: now,
      });
      const calendar = await workshop.hours.calendar(tx);
      const today = localDateOf(now);
      const hours = calendar.holidays.has(today) ? null : calendar.week[weekdayOf(today)];
      const snapshot = locked.carSnapshot as { label: string; plate: string };
      await tell(
        tx,
        locked.clientId,
        {
          type: 'order.ready',
          orderId,
          number: locked.number,
          car: snapshot.label,
          plate: snapshot.plate,
          total: locked.total,
          closesAt: hours ? hours.close.slice(0, 5) : null,
        },
        `ready:${orderId}`,
      );
    },

    async noShow(actor, id, ip) {
      requirePermission(actor, 'orders.write');
      return db.transaction(async (tx) => {
        const now = clock.now();
        const locked = await lockedOrder(tx, id);
        const reservation = await bookingOf(tx, id);
        if (!noShowAllowed(locked.status, reservation.startsAt, now)) {
          throw new AppError('invalid_transition', 'the slot has not begun');
        }
        const [reason] = await tx
          .select()
          .from(cancelReasons)
          .where(eq(cancelReasons.code, 'no_show'));
        const [updated] = await tx
          .update(orders)
          .set({ status: 'no_show', cancelReasonId: reason?.id ?? null, updatedAt: now })
          .where(and(eq(orders.id, id), eq(orders.status, 'confirmed')))
          .returning();
        if (!updated) throw new AppError('invalid_transition');
        await booking.release(tx, id, 'no_show');
        await recordStatus(tx, {
          entity: 'order',
          entityId: id,
          from: 'confirmed',
          to: 'no_show',
          actorId: actor.userId,
          reasonId: reason?.id ?? null,
          at: now,
        });
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'order.no_show',
          entity: 'order',
          entityId: id,
          ip: ip ?? null,
        });
        return oneView(tx, actor, id);
      });
    },

    async availability(actor, input) {
      requirePermission(actor, 'orders.read');
      const priced = await price(db, input.bodyClass, input.serviceIds);
      return {
        days: await booking.availability(priced.job, { waiveLead: true }),
        multiDay: priced.quote.multiDay,
      };
    },

    async slots(actor, input) {
      requirePermission(actor, 'orders.read');
      const priced = await price(db, input.bodyClass, input.serviceIds);
      const { slots, nearest } = await booking.slots(
        priced.job,
        input.date,
        input.exceptOrderId,
        // The staff may book sooner than the clients' lead time: the panel offers those times too.
        { waiveLead: true },
      );
      return {
        date: input.date,
        slots: slots.map(slotView),
        nearest: nearest.map(slotView),
        multiDay: priced.quote.multiDay,
      };
    },

    async today(actor) {
      requirePermission(actor, 'today.read');
      const now = clock.now();
      const today = localDateOf(now);
      const from = instantAt(today, '00:00');
      const to = instantAt(addDays(today, 1), '00:00');
      const startsAt = currentStart;

      const countOf = async (status: OrderStatus) => {
        const [row] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(orders)
          .where(eq(orders.status, status));
        return row?.n ?? 0;
      };
      const arrivalRows = await db
        .select()
        .from(orders)
        .where(
          and(
            notInArray(orders.status, ['cancelled', 'no_show']),
            sql`${startsAt} >= ${from}`,
            sql`${startsAt} < ${to}`,
          ),
        )
        .orderBy(asc(startsAt));
      const arrivals = await adminViews(db, actor, arrivalRows);
      const waiting = await db.select().from(orders).where(eq(orders.status, 'new'));
      const waitingViews = await adminViews(db, actor, waiting);

      return {
        now: instant(now),
        counters: {
          newOrders: waitingViews.length,
          unanswered: waitingViews.filter((order) => order.callWarn).length,
          arrivalsToday: arrivals.length,
          inWork: await countOf('in_work'),
          readyForPickup: await countOf('ready_for_pickup'),
        },
        arrivals,
      };
    },

    async forClient(actor, clientId, limit) {
      requirePermission(actor, 'orders.read');
      const rows = await db
        .select()
        .from(orders)
        .where(eq(orders.clientId, clientId))
        .orderBy(desc(orders.createdAt), desc(orders.id))
        .limit(limit);
      return adminViews(db, actor, rows);
    },

    async anonymize(tx, clientId) {
      await tx
        .update(orders)
        .set({ carSnapshot: sql`jsonb_set(${orders.carSnapshot}, '{plate}', '"—"')` })
        .where(eq(orders.clientId, clientId));
    },

    async cancelReasons(actor) {
      requirePermission(actor, 'orders.read');
      const rows = await db
        .select()
        .from(cancelReasons)
        .where(
          and(
            eq(cancelReasons.isActive, true),
            inArray(cancelReasons.appliesTo, ['client', 'staff']),
          ),
        )
        .orderBy(asc(cancelReasons.sort));
      return rows.map((row) => ({
        id: row.id,
        nameUz: row.nameUz,
        nameRu: row.nameRu,
        requiresText: row.requiresText,
      }));
    },
  };
}
