import { and, asc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { DbOrTx, Tx } from '../../../db/client';
import { bookings, boxes } from '../../../db/schema';
import { addDays } from '../../../lib/time';
import type { PlatformDeps } from '../../../platform/deps';
import { AppError } from '../../../platform/errors';
import { createWorkTime, type WorkshopService } from '../../workshop';
import {
  availability,
  checkStart,
  daySlots,
  nearestFreeSlots,
  type DayAvailability,
  type Planning,
  type Slot,
} from '../domain/slots';

/**
 * Booking: which times are free for a job, and holding a box for an order (docs/PLAN.md, section
 * 10). The database, not this code, guarantees that a box is never held twice (the EXCLUDE
 * constraint `bookings_no_overlap`).
 */

export interface BookingServiceDeps extends PlatformDeps {
  workshop: Pick<WorkshopService, 'settings' | 'hours' | 'boxes'>;
}

/** What a job asks of the workshop: the kinds of work, and the working minutes `W` it holds a box. */
export interface JobSpec {
  serviceTypeIds: readonly string[];
  workMinutes: number;
}

export interface Reservation {
  bookingId: string;
  boxId: string;
  boxName: string;
  startsAt: Date;
  endsAt: Date;
}

export interface ReserveInput {
  orderId: string;
  startsAt: Date;
  job: JobSpec;
  createdBy: string | null;
  /** Staff may book a time sooner than the lead time (a client at the door), never in the past. */
  waiveLead?: boolean;
  /**
   * The start stays what it was and only the end is worked out again (the order's zones changed):
   * no check of the lead time or the horizon, as the order is already booked.
   */
  keepStart?: boolean;
}

export interface PlanningOptions {
  /** The staff see what they may book: times sooner than the clients' lead time too. */
  waiveLead?: boolean;
}

export interface BookingService {
  /** Each day of the horizon: free, full or closed. */
  availability(job: JobSpec, options?: PlanningOptions): Promise<DayAvailability[]>;
  /** The start times of one day, and the nearest free ones after it when it has none. */
  slots(
    job: JobSpec,
    date: string,
    /** Moving an order: its own booking does not block its new time. */
    exceptOrderId?: string,
    options?: PlanningOptions,
  ): Promise<{ slots: Slot[]; nearest: Slot[] }>;
  /**
   * Holds a box for the order, inside the order's transaction. The time must be one the workshop
   * offers; boxes are tried in the owner's order, and when all are held, `slot_taken`.
   */
  reserve(tx: Tx, input: ReserveInput): Promise<Reservation>;
  /**
   * Moves or resizes the order's booking: gives the box back and holds one again, in one go. When
   * nothing is free the whole change fails with `slot_taken` and the old booking stays.
   */
  rebook(tx: Tx, input: ReserveInput): Promise<Reservation>;
  /** Gives the order's box back, so the time is free for others again. */
  release(tx: Tx, orderId: string, reason: string): Promise<void>;
  /**
   * The work is done and the car only waits to be taken (docs/PLAN.md, section 9.1): a booking that
   * has not begun is given back whole, one that has begun is cut short at this moment, so the time
   * the job did not need is free for another client.
   */
  shorten(tx: Tx, orderId: string): Promise<void>;
  /** The latest booking of each order, for showing its time and box. */
  reservations(orderIds: readonly string[], from?: DbOrTx): Promise<Map<string, Reservation>>;
}

export function createBookingService(deps: BookingServiceDeps): BookingService {
  const { db, clock, workshop } = deps;

  async function planningFor(
    from: DbOrTx,
    job: JobSpec,
    exceptOrderId?: string,
  ): Promise<Planning> {
    const now = clock.now();
    // Everything is read first, with the connection the caller gave: inside a transaction that is
    // the transaction's own, so no second connection is needed (docs/PLAN.md, section 4.5).
    // One query after another: a transaction has a single connection.
    const { rules } = await workshop.settings.current(from);
    const calendar = await workshop.hours.calendar(from);
    const eligible = await workshop.boxes.eligible(job.serviceTypeIds, from);
    const busy =
      eligible.length === 0
        ? []
        : await from
            .select({
              boxId: bookings.boxId,
              startsAt: bookings.startsAt,
              endsAt: bookings.endsAt,
            })
            .from(bookings)
            .where(
              and(
                isNull(bookings.releasedAt),
                gt(bookings.endsAt, now),
                exceptOrderId
                  ? or(isNull(bookings.orderId), ne(bookings.orderId, exceptOrderId))
                  : undefined,
                inArray(
                  bookings.boxId,
                  eligible.map((box) => box.id),
                ),
              ),
            );
    return {
      now,
      rules,
      time: createWorkTime(calendar),
      boxes: eligible,
      busy,
      job: { workMinutes: job.workMinutes },
    };
  }

  const service: BookingService = {
    async availability(job, options) {
      const planning = await planningFor(db, job);
      if (options?.waiveLead) planning.rules = { ...planning.rules, minLeadMin: 0 };
      return availability(planning);
    },

    async slots(job, date, exceptOrderId, options) {
      const planning = await planningFor(db, job, exceptOrderId);
      if (options?.waiveLead) planning.rules = { ...planning.rules, minLeadMin: 0 };
      const slots = daySlots(date, planning);
      // The first free times after this day, only when it has none itself (client PDF, page 18).
      const nearest = slots.some((slot) => slot.free)
        ? []
        : nearestFreeSlots(addDays(date, 1), 3, planning);
      return { slots, nearest };
    },

    async reserve(tx, input) {
      const planning = await planningFor(tx, input.job);
      if (input.waiveLead) planning.rules = { ...planning.rules, minLeadMin: 0 };
      let endsAt: Date;
      if (input.keepStart) {
        const end = planning.time.addWorkMinutes(input.startsAt, input.job.workMinutes);
        if (!end) throw new AppError('slot_unavailable', 'no working time');
        endsAt = end;
      } else {
        const checked = checkStart(input.startsAt, planning);
        if (!checked.ok) throw new AppError('slot_unavailable', checked.problem);
        endsAt = checked.endsAt;
      }
      // No box does this kind of work: nothing can ever be free for it.
      if (planning.boxes.length === 0) throw new AppError('slot_unavailable', 'no box');

      for (const box of planning.boxes) {
        // A box that is held over this time makes the insert do nothing instead of failing, so the
        // next box can be tried inside the same transaction.
        const [inserted] = await tx
          .insert(bookings)
          .values({
            kind: 'order',
            orderId: input.orderId,
            boxId: box.id,
            startsAt: input.startsAt,
            endsAt,
            createdBy: input.createdBy,
          })
          .onConflictDoNothing()
          .returning({ id: bookings.id });
        if (inserted) {
          return {
            bookingId: inserted.id,
            boxId: box.id,
            boxName: box.name,
            startsAt: input.startsAt,
            endsAt,
          };
        }
      }
      throw new AppError('slot_taken');
    },

    async rebook(tx, input) {
      await service.release(tx, input.orderId, 'rebooked');
      return service.reserve(tx, input);
    },

    async release(tx, orderId, reason) {
      await tx
        .update(bookings)
        .set({ releasedAt: clock.now(), releaseReason: reason })
        .where(and(eq(bookings.orderId, orderId), isNull(bookings.releasedAt)));
    },

    async shorten(tx, orderId) {
      const now = clock.now();
      const [current] = await tx
        .select()
        .from(bookings)
        .where(and(eq(bookings.orderId, orderId), isNull(bookings.releasedAt)));
      if (!current) return;
      if (current.startsAt.getTime() >= now.getTime()) {
        await this.release(tx, orderId, 'work_done');
      } else if (current.endsAt.getTime() > now.getTime()) {
        await tx.update(bookings).set({ endsAt: now }).where(eq(bookings.id, current.id));
      }
    },

    async reservations(orderIds, from = db) {
      const result = new Map<string, Reservation>();
      if (orderIds.length === 0) return result;
      const rows = await from
        .select({
          id: bookings.id,
          orderId: bookings.orderId,
          boxId: bookings.boxId,
          boxName: boxes.name,
          startsAt: bookings.startsAt,
          endsAt: bookings.endsAt,
        })
        .from(bookings)
        .innerJoin(boxes, eq(boxes.id, bookings.boxId))
        .where(inArray(bookings.orderId, [...orderIds]))
        // The booking the order holds now comes last and so wins: a given-back one is older, even
        // when both were written in one transaction and share its timestamp.
        .orderBy(sql`${bookings.releasedAt} is null`, asc(bookings.createdAt), asc(bookings.id));
      for (const row of rows) {
        if (row.orderId === null) continue;
        // Oldest first, so the last one wins: the booking the order holds now, or held last.
        result.set(row.orderId, {
          bookingId: row.id,
          boxId: row.boxId,
          boxName: row.boxName,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
        });
      }
      return result;
    },
  };
  return service;
}
