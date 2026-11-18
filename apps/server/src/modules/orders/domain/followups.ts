import type { OrderStatus } from '@cs/shared/vocabulary';

/**
 * What the system reminds and warns about on its own (docs/PLAN.md, sections 4.8 and 12). Pure:
 * the scheduled tasks ask these questions of the data and act on the answers.
 */

const HOUR_MS = 3_600_000;

export interface ReminderCandidate {
  status: OrderStatus;
  /** When the workshop confirmed the order; null if it never was. */
  confirmedAt: Date | null;
  /** When the booked slot begins. */
  startsAt: Date;
  remindersEnabled: boolean;
}

/**
 * Whether the reminder "N hours before" goes now. It goes for a confirmed order, from N hours
 * before the visit until the visit, and only if the order was confirmed before that window began:
 * a client who has just been called is not reminded a minute later of what they were just told.
 */
export function reminderDue(order: ReminderCandidate, hoursBefore: number, now: Date): boolean {
  if (order.status !== 'confirmed' || !order.remindersEnabled || order.confirmedAt === null) {
    return false;
  }
  const windowStart = new Date(order.startsAt.getTime() - hoursBefore * HOUR_MS);
  return order.confirmedAt <= windowStart && now >= windowStart && now < order.startsAt;
}

/** One reminder per order, hour and time: a moved order gets new ones (docs/PLAN.md, section 12). */
export const reminderKey = (orderId: string, hoursBefore: number, startsAt: Date): string =>
  `reminder:${orderId}:${hoursBefore}:${startsAt.toISOString()}`;

/**
 * An order nobody has called about for too long is reported to the director and the owner. Counted
 * in working minutes, so a request made at night is not late in the morning.
 */
export function callOverdue(input: {
  status: OrderStatus;
  calls: number;
  waitingWorkMin: number;
  thresholdMin: number;
}): boolean {
  return input.status === 'new' && input.calls === 0 && input.waitingWorkMin >= input.thresholdMin;
}
