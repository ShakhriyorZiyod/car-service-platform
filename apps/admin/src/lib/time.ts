/**
 * Dates reach the panel as the workshop's local strings ("2026-10-29", "14:30"), already worked
 * out by the server. These helpers only move a date string around or write one back for the API;
 * they never read the browser's clock or time zone.
 */

/** The workshop works in Tashkent, which has no daylight saving: always UTC+5. */
const WORKSHOP_OFFSET = '+05:00';

/**
 * "2026-10-29", "14:30" → the instant in UTC ("2026-10-29T09:30:00.000Z"), the form the API takes.
 * The date and time are read at the workshop's fixed offset, never at the browser's own.
 */
export const instantFor = (date: string, time: string): string =>
  new Date(`${date}T${time}:00${WORKSHOP_OFFSET}`).toISOString();

/** "2026-10-29" shifted by whole days. */
export function shiftDate(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/** 1 = Monday … 7 = Sunday, for "2026-10-29". */
export function weekdayOfDate(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** "14:30" → 870 minutes since midnight. */
export function minutesOf(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
}
