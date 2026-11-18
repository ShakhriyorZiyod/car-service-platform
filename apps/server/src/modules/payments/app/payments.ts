import type { Cash, Handover, OrderResult, WorkPhotos } from '@cs/shared';
import { PAYMENT_METHODS, type PaymentMethod } from '@cs/shared/vocabulary';
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import type { DbOrTx, Tx } from '../../../db/client';
import { fiscalReceipts, orders, payments } from '../../../db/schema';
import { addDays, instantAt, presentInstant, type LocalDate } from '../../../lib/time';
import { requirePermission, type ClientActor, type StaffActor } from '../../../platform/actors';
import type { PlatformDeps } from '../../../platform/deps';
import { AppError, invalidAt } from '../../../platform/errors';
import type { AuditService } from '../../audit';
import type { AdminOrdersService } from '../../orders';
import type { TaskWork, TasksService } from '../../tasks';
import type { WorkshopService } from '../../workshop';
import { cashSummary, checkCheckout, cleanReceiptNo, type PaymentLine } from '../domain/checkout';
import type { FiscalProvider } from './fiscal';

/**
 * Handing the car over and taking the money (docs/PLAN.md, sections 7.12, 9.1 and 11): what was
 * done and by whom, checkout in one step (payments, the fiscal receipt and "completed" together),
 * the owner's correction of a payment method, and the day's takings.
 */

export interface PaymentsDeps extends PlatformDeps {
  audit: AuditService;
  workshop: Pick<WorkshopService, 'settings'>;
  orders: Pick<AdminOrdersService, 'get' | 'checkoutState' | 'completeInside'>;
  tasks: Pick<TasksService, 'workOf'>;
  fiscal: FiscalProvider;
}

export interface CheckoutInput {
  /** The checkout's key: the same key gives the same result. */
  requestId: string;
  payments: readonly PaymentLine[];
  receiptNo: string;
}

export interface PaymentsService {
  handover(actor: StaffActor, orderId: string): Promise<Handover>;
  /** Idempotent by `requestId`; of two different checkouts of one order only one passes. */
  checkout(
    actor: StaffActor,
    orderId: string,
    input: CheckoutInput,
    ip?: string,
  ): Promise<Handover>;
  /** The owner corrects a method chosen by mistake; the amount never changes. */
  correctMethod(
    actor: StaffActor,
    paymentId: string,
    method: PaymentMethod,
    ip?: string,
  ): Promise<Handover>;
  /** What the client sees of their order's result (design T12). */
  resultForClient(client: ClientActor, orderId: string): Promise<OrderResult>;
  /** The takings of a day in the workshop's calendar, by the time the money was taken. */
  cashOf(date: LocalDate): Promise<Cash>;
}

const toPhotos = (work: readonly TaskWork[]): WorkPhotos[] =>
  work.map((task) => ({
    taskId: task.taskId,
    items: task.items.map((item) => ({ nameUz: item.nameUz, nameRu: item.nameRu })),
    before: task.before,
    after: task.after,
  }));

export function createPaymentsService(deps: PaymentsDeps): PaymentsService {
  const { db, clock, audit, workshop, orders: ordersService, tasks, fiscal } = deps;

  async function paymentsOf(from: DbOrTx, orderId: string) {
    return from
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId))
      .orderBy(asc(payments.receivedAt), asc(payments.id));
  }

  async function receiptOf(from: DbOrTx, orderId: string) {
    const [row] = await from
      .select()
      .from(fiscalReceipts)
      .where(eq(fiscalReceipts.orderId, orderId));
    return row ?? null;
  }

  async function handoverView(actor: StaffActor, orderId: string): Promise<Handover> {
    const order = await ordersService.get(actor, orderId);
    const { rules } = await workshop.settings.current();
    const work = await tasks.workOf(db, orderId);
    const [row] = await db
      .select({ readyAt: orders.readyAt })
      .from(orders)
      .where(eq(orders.id, orderId));
    const paid = await paymentsOf(db, orderId);
    const receipt = await receiptOf(db, orderId);
    const now = clock.now();
    return {
      order,
      masters: order.items.map((item) => ({
        itemId: item.id,
        masterName:
          work.find((task) => task.items.some((done) => done.id === item.id))?.masterName ?? null,
      })),
      photos: toPhotos(work),
      discountLimitPct: rules.adminDiscountLimitPct,
      discountUnlimited: actor.permissions.has('discount.unlimited'),
      waitingMin:
        order.status === 'ready_for_pickup' && row?.readyAt
          ? Math.max(0, Math.floor((now.getTime() - row.readyAt.getTime()) / 60_000))
          : null,
      payments: paid.map((payment) => ({
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
      canCorrectPayments: actor.permissions.has('payments.correct') && paid.length > 0,
    };
  }

  /** Writes the checkout inside the transaction; nothing when this key already did it. */
  async function checkoutInside(
    tx: Tx,
    actor: StaffActor,
    orderId: string,
    input: CheckoutInput,
    ip: string | undefined,
  ): Promise<void> {
    // The order's lock first: a second checkout waits here and then sees the first one's result.
    const state = await ordersService.checkoutState(tx, orderId);
    const [earlier] = await tx
      .select()
      .from(fiscalReceipts)
      .where(eq(fiscalReceipts.requestId, input.requestId));
    if (earlier) {
      if (earlier.orderId !== orderId) {
        throw invalidAt('body.requestId', 'this key was used for another order');
      }
      return;
    }

    const problem = checkCheckout({
      status: state.status,
      total: state.total,
      unpricedCount: state.unpricedCount,
      payments: input.payments,
      receiptNo: input.receiptNo,
    });
    if (problem === 'invalid_transition' || problem === 'unpriced_items') {
      throw new AppError(problem);
    }
    if (problem === 'payment_mismatch') {
      throw new AppError('payment_mismatch', 'payments do not add up', {
        paths: ['body.payments'],
      });
    }
    if (problem === 'receipt_missing') throw invalidAt('body.receiptNo', 'no receipt number');
    if (problem === 'bad_payments') throw invalidAt('body.payments', 'bad payment lines');

    const now = clock.now();
    const receiptNo = cleanReceiptNo(input.receiptNo);
    const issued = await fiscal.issue({
      orderId,
      amount: state.total,
      requestId: input.requestId,
      receiptNo,
    });
    for (const line of input.payments) {
      await tx.insert(payments).values({
        orderId,
        method: line.method,
        amount: line.amount,
        receivedBy: actor.userId,
        receivedAt: now,
      });
    }
    await tx.insert(fiscalReceipts).values({
      orderId,
      provider: issued.provider,
      status: issued.status,
      receiptNo: issued.receiptNo,
      fiscalSign: issued.fiscalSign,
      receiptUrl: issued.receiptUrl,
      amount: state.total,
      requestId: input.requestId,
      createdBy: actor.userId,
      createdAt: now,
    });
    await ordersService.completeInside(tx, actor, orderId, issued.receiptNo);
    await audit.record(tx, {
      actorId: actor.userId,
      action: 'order.checkout',
      entity: 'order',
      entityId: orderId,
      after: {
        total: state.total,
        payments: input.payments.map((line) => ({ method: line.method, amount: line.amount })),
        receiptNo: issued.receiptNo,
      },
      ip: ip ?? null,
    });
  }

  return {
    async handover(actor, orderId) {
      requirePermission(actor, 'orders.read');
      return handoverView(actor, orderId);
    },

    async checkout(actor, orderId, input, ip) {
      requirePermission(actor, 'checkout.write');
      await db.transaction((tx) => checkoutInside(tx, actor, orderId, input, ip));
      return handoverView(actor, orderId);
    },

    async correctMethod(actor, paymentId, method, ip) {
      requirePermission(actor, 'payments.correct');
      const orderId = await db.transaction(async (tx) => {
        const [payment] = await tx
          .select()
          .from(payments)
          .where(eq(payments.id, paymentId))
          .for('update');
        if (!payment) throw new AppError('not_found');
        if (payment.method === method) return payment.orderId;
        await tx.update(payments).set({ method }).where(eq(payments.id, paymentId));
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'payment.method.correct',
          entity: 'payment',
          entityId: paymentId,
          before: { orderId: payment.orderId, method: payment.method, amount: payment.amount },
          after: { orderId: payment.orderId, method, amount: payment.amount },
          ip: ip ?? null,
        });
        return payment.orderId;
      });
      return handoverView(actor, orderId);
    },

    async resultForClient(client, orderId) {
      const [order] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.clientId, client.userId)));
      // Somebody else's order does not exist for them.
      if (!order) throw new AppError('not_found');
      const work = await tasks.workOf(db, orderId);
      const paid = await paymentsOf(db, orderId);
      const receipt = await receiptOf(db, orderId);
      return {
        photos: toPhotos(work),
        payments: paid.map((payment) => ({ method: payment.method, amount: payment.amount })),
        receiptNo: receipt?.receiptNo ?? null,
      };
    },

    async cashOf(date) {
      const from = instantAt(date, '00:00');
      const to = instantAt(addDays(date, 1), '00:00');
      const rows = await db
        .select({ method: payments.method, amount: payments.amount })
        .from(payments)
        .where(and(gte(payments.receivedAt, from), lt(payments.receivedAt, to)));
      const receipts = await db
        .select({ id: fiscalReceipts.id })
        .from(fiscalReceipts)
        .where(and(gte(fiscalReceipts.createdAt, from), lt(fiscalReceipts.createdAt, to)));
      const summary = cashSummary(rows, receipts.length);
      return {
        byMethod: PAYMENT_METHODS.map((method) => ({ method, amount: summary.byMethod[method] })),
        total: summary.total,
        receipts: summary.receipts,
      };
    },
  };
}
