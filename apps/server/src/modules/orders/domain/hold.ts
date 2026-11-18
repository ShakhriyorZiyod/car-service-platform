import type { OrderStatus } from '@cs/shared/vocabulary';

/**
 * How long a new order holds its slot waiting for the admin's call (docs/PLAN.md, section 10.4).
 * The time is counted in working minutes, so a booking made at night is not cancelled before the
 * admin has come to work.
 */

export interface HoldClock {
  addWorkMinutes(start: Date, minutes: number): Date | null;
}

/** When a request made at `createdAt` stops holding its slot; null if there is no working time. */
export function holdUntil(time: HoldClock, createdAt: Date, holdNewWorkMin: number): Date | null {
  return time.addWorkMinutes(createdAt, holdNewWorkMin);
}

/**
 * After "no answer" the hold is stretched, never shortened: the later of the old hold and
 * `holdNoAnswerHours` from now.
 */
export function holdAfterNoAnswer(
  current: Date | null,
  now: Date,
  holdNoAnswerHours: number,
): Date {
  const stretched = new Date(now.getTime() + holdNoAnswerHours * 3_600_000);
  return current && current > stretched ? current : stretched;
}

export interface HeldOrder {
  status: OrderStatus;
  holdUntil: Date | null;
  /** When the booked slot begins. */
  startsAt: Date;
}

/**
 * A new order whose hold has run out is cancelled, unless the slot itself starts before the hold
 * ends: then the client may be on the way, and the admin settles it on the spot.
 */
export function holdExpired(order: HeldOrder, now: Date): boolean {
  if (order.status !== 'new' || order.holdUntil === null) return false;
  return now >= order.holdUntil && order.holdUntil < order.startsAt;
}
