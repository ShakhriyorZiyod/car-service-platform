import type { Order } from '@cs/shared';
import type { OrderStatus } from '@cs/shared/vocabulary';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '../../../db/client';
import type { orders } from '../../../db/schema';
import { orderItems, statusHistory, tasks } from '../../../db/schema';
import { presentInstant } from '../../../lib/time';
import type { OrderNotification } from '../../../notifications/types';
import type { BookingService, Reservation } from '../../booking';
import { clientActions } from '../domain/order-status';

/**
 * How an order is shown and told (docs/PLAN.md, sections 4.6 and 12): the client's view of it, and
 * the facts a message carries. Shared by the client's and the staff's use cases.
 */

export type OrderRow = typeof orders.$inferSelect;

export const instant = (value: Date) => presentInstant(value);

export const slotView = (slot: {
  startsAt: Date;
  endsAt: Date;
  free: boolean;
  box: { name: string } | null;
}) => ({
  startsAt: instant(slot.startsAt),
  endsAt: instant(slot.endsAt),
  free: slot.free,
  boxName: slot.box?.name ?? null,
});

/** How far a zone has got, from the order's state and its task's (design T6). */
export function zoneProgress(
  orderStatus: OrderStatus,
  item: { approval: string; taskId: string | null },
  taskStatus: string | null,
): 'queued' | 'in_progress' | 'ready' | null {
  if (item.approval === 'rejected' || item.approval === 'pending') return null;
  if (orderStatus === 'ready_for_pickup' || orderStatus === 'completed') return 'ready';
  if (orderStatus !== 'in_work') return null;
  if (taskStatus === 'accepted') return 'ready';
  if (taskStatus === 'in_progress' || taskStatus === 'on_review' || taskStatus === 'rework') {
    return 'in_progress';
  }
  return 'queued';
}

export function createViews(booking: Pick<BookingService, 'reservations'>) {
  /** The orders as the client sees them: items, time and box, history, and what they may do. */
  async function viewsOf(from: DbOrTx, rows: readonly OrderRow[]): Promise<Order[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    // One query after another: a transaction has a single connection.
    const items = await from
      .select()
      .from(orderItems)
      .where(inArray(orderItems.orderId, ids))
      .orderBy(asc(orderItems.createdAt), asc(orderItems.id));
    const taskIds = [...new Set(items.flatMap((item) => (item.taskId ? [item.taskId] : [])))];
    const taskRows =
      taskIds.length === 0
        ? []
        : await from
            .select({ id: tasks.id, status: tasks.status })
            .from(tasks)
            .where(inArray(tasks.id, taskIds));
    const reservations = await booking.reservations(ids, from);
    const history = await from
      .select()
      .from(statusHistory)
      .where(and(eq(statusHistory.entity, 'order'), inArray(statusHistory.entityId, ids)))
      .orderBy(asc(statusHistory.at), asc(statusHistory.id));

    return rows.map((row) => {
      const reservation = reservations.get(row.id);
      if (!reservation) throw new Error(`order ${row.id} has no booking`);
      const mine = items.filter((item) => item.orderId === row.id);
      const snapshot = row.carSnapshot as { label: string; plate: string };
      const rescheduleRequested = row.rescheduleRequestedAt !== null;
      return {
        id: row.id,
        number: row.number,
        status: row.status,
        startsAt: instant(reservation.startsAt),
        endsAt: instant(reservation.endsAt),
        car: { label: snapshot.label, plate: snapshot.plate },
        items: mine.map((item) => ({
          id: item.id,
          kind: item.kind,
          approval: item.approval,
          progress: zoneProgress(
            row.status,
            item,
            taskRows.find((task) => task.id === item.taskId)?.status ?? null,
          ),
          nameUz: item.nameUz,
          nameRu: item.nameRu,
          typeNameUz: item.typeNameUz,
          typeNameRu: item.typeNameRu,
          price: item.price,
          durationMin: item.durationMin,
        })),
        subtotal: row.subtotal,
        // Only work that counts: a refused or unanswered extra is not "to be agreed" yet.
        unpricedCount: mine.filter(
          (item) =>
            item.price === null &&
            (item.approval === 'not_required' || item.approval === 'approved'),
        ).length,
        total: row.total,
        comment: row.clientComment,
        holdUntil: row.status === 'new' && row.holdUntil ? instant(row.holdUntil) : null,
        rescheduleRequested,
        boxName: reservation.boxName,
        ...clientActions({ status: row.status, rescheduleRequested }),
        history: history
          .filter((step) => step.entityId === row.id)
          .map((step) => ({ status: step.toStatus as OrderStatus, at: instant(step.at) })),
      };
    });
  }

  /** What a message says about an order, as it is now. */
  async function factsOf(
    from: DbOrTx,
    row: OrderRow,
    reservation: Reservation,
  ): Promise<Omit<Extract<OrderNotification, { type: 'order.created' }>, 'type'>> {
    const items = await from.select().from(orderItems).where(eq(orderItems.orderId, row.id));
    const snapshot = row.carSnapshot as { label: string; plate: string };
    return {
      orderId: row.id,
      number: row.number,
      car: snapshot.label,
      plate: snapshot.plate,
      startsAt: {
        date: instant(reservation.startsAt).date,
        time: instant(reservation.startsAt).time,
      },
      items: items.map((item) => ({
        nameUz: item.nameUz,
        nameRu: item.nameRu,
        typeNameUz: item.typeNameUz,
        typeNameRu: item.typeNameRu,
      })),
      total: row.total,
      hasUnpriced: items.some((item) => item.price === null),
    };
  }

  async function bookingOf(from: DbOrTx, orderId: string): Promise<Reservation> {
    const reservation = (await booking.reservations([orderId], from)).get(orderId);
    if (!reservation) throw new Error(`order ${orderId} has no booking`);
    return reservation;
  }

  return { viewsOf, factsOf, bookingOf };
}
