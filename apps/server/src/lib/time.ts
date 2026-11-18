import { DateTime } from 'luxon';

/**
 * Time rules (docs/PLAN.md, section 2, rule 8): the database stores instants in UTC; every
 * calendar question (which day, what time, which weekday) is answered in the workshop's zone.
 * Uzbekistan has no daylight saving time, but nothing here relies on that.
 */
export const TIMEZONE = 'Asia/Tashkent';

/** A calendar date in the workshop's zone: "2026-10-29". */
export type LocalDate = string;
/** A wall-clock time in the workshop's zone: "10:00". */
export type LocalTime = string;

const inZone = (instant: Date) => DateTime.fromJSDate(instant, { zone: TIMEZONE });

function ensureValid(value: DateTime, input: string): DateTime<true> {
  if (!value.isValid) throw new RangeError(`not a valid local date or time: ${input}`);
  // Luxon's `isValid` does not narrow the type; the check above is what makes this true.
  return value as DateTime<true>;
}

/**
 * Only these exact forms are accepted. Luxon alone would take more: ISO's "24:00" (silently the
 * next day's midnight), week dates, ordinal dates.
 */
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseLocal(date: LocalDate, time: LocalTime = '00:00'): DateTime<true> {
  const input = `${date}T${time}`;
  if (!LOCAL_DATE.test(date) || !LOCAL_TIME.test(time)) {
    throw new RangeError(`not a valid local date or time: ${input}`);
  }
  return ensureValid(DateTime.fromISO(input, { zone: TIMEZONE }), input);
}

/** The workshop's calendar date at this instant. */
export function localDateOf(instant: Date): LocalDate {
  return ensureValid(inZone(instant), instant.toISOString()).toISODate();
}

/** The workshop's wall-clock time at this instant, "HH:mm". */
export function localTimeOf(instant: Date): LocalTime {
  return ensureValid(inZone(instant), instant.toISOString()).toFormat('HH:mm');
}

/** The instant when the workshop's clock shows `time` on `date`. */
export function instantAt(date: LocalDate, time: LocalTime): Date {
  return parseLocal(date, time).toJSDate();
}

/** 1 = Monday … 7 = Sunday. */
export function weekdayOf(date: LocalDate): number {
  return parseLocal(date).weekday;
}

/** `days` calendar days after `date` (negative for before). */
export function addDays(date: LocalDate, days: number): LocalDate {
  return parseLocal(date).plus({ days }).toISODate();
}

/** An instant as the API sends it: the exact moment and the workshop's local date and time. */
export function presentInstant(instant: Date): { at: string; date: LocalDate; time: LocalTime } {
  return { at: instant.toISOString(), date: localDateOf(instant), time: localTimeOf(instant) };
}

export const minutes = (n: number): number => n * 60_000;
export const hours = (n: number): number => n * 3_600_000;
export const days = (n: number): number => n * 86_400_000;
