import {
  addDays,
  instantAt,
  localDateOf,
  weekdayOf,
  type LocalDate,
  type LocalTime,
} from '../../../lib/time';

/**
 * Working time (docs/PLAN.md, section 10.1): which instants belong to the workshop's working day.
 * Pure: the calendar arrives as an argument, nothing here reads the clock or the database.
 *
 * Every calendar question is answered in the workshop's zone, so "the working day of Thursday"
 * means the same for a client in any time zone.
 */

export interface WorkDay {
  open: LocalTime;
  close: LocalTime;
  /** The working day is split in two by a break; both are null when there is none. */
  breakStart: LocalTime | null;
  breakEnd: LocalTime | null;
}

export interface WorkCalendar {
  /** The hours by weekday (1 = Monday … 7 = Sunday); a weekday that is missing is a day off. */
  week: Readonly<Partial<Record<number, WorkDay>>>;
  holidays: ReadonlySet<LocalDate>;
}

/** From `start` up to but not including `end`. */
export interface Interval {
  start: Date;
  end: Date;
}

const MINUTE_MS = 60_000;
/** A calendar with no working day at all must end the search, not run forever. */
const SEARCH_DAYS = 400;
/** The longest span `workMinutesBetween` agrees to walk through day by day. */
const MAX_SPAN_DAYS = 3_660;

const nonEmpty = (interval: Interval): boolean => interval.end > interval.start;

/**
 * The working stretches of a date, in order: the day without the break. Empty on a day off and on
 * a holiday.
 */
export function workIntervals(calendar: WorkCalendar, date: LocalDate): Interval[] {
  if (calendar.holidays.has(date)) return [];
  const day = calendar.week[weekdayOf(date)];
  if (!day) return [];

  const at = (time: LocalTime) => instantAt(date, time);
  if (day.breakStart !== null && day.breakEnd !== null) {
    return [
      { start: at(day.open), end: at(day.breakStart) },
      { start: at(day.breakEnd), end: at(day.close) },
    ].filter(nonEmpty);
  }
  return [{ start: at(day.open), end: at(day.close) }].filter(nonEmpty);
}

/**
 * The instant `minutes` of working time after `start`: the break, the evening, days off and
 * holidays do not count. Work that ends exactly where a stretch ends ends there: 18:00 plus two
 * hours in a workshop that closes at 20:00 is 20:00, not tomorrow's opening.
 *
 * A start outside working hours counts from the next opening, so `0` minutes gives the first
 * working instant at or after `start`. Null when the calendar has no working time at all in the
 * next year.
 */
export function addWorkMinutes(calendar: WorkCalendar, start: Date, minutes: number): Date | null {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new RangeError(`working minutes must be a whole number, not negative: ${minutes}`);
  }
  let remainingMs = minutes * MINUTE_MS;
  const from = start.getTime();
  let date = localDateOf(start);

  for (let day = 0; day <= SEARCH_DAYS; day += 1) {
    for (const interval of workIntervals(calendar, date)) {
      const begin = Math.max(from, interval.start.getTime());
      const end = interval.end.getTime();
      if (begin >= end) continue;
      if (remainingMs === 0) return new Date(begin);
      const available = end - begin;
      if (available >= remainingMs) return new Date(begin + remainingMs);
      remainingMs -= available;
    }
    date = addDays(date, 1);
  }
  return null;
}

/**
 * The whole working minutes between two instants (zero when `to` is not after `from`): what the
 * call timers and the hold of a new request count.
 */
export function workMinutesBetween(calendar: WorkCalendar, from: Date, to: Date): number {
  if (to <= from) return 0;
  const last = localDateOf(to);
  let date = localDateOf(from);
  let totalMs = 0;

  for (let day = 0; date <= last; day += 1) {
    if (day > MAX_SPAN_DAYS) throw new RangeError('the span is too long to count working time');
    for (const interval of workIntervals(calendar, date)) {
      const begin = Math.max(from.getTime(), interval.start.getTime());
      const end = Math.min(to.getTime(), interval.end.getTime());
      if (end > begin) totalMs += end - begin;
    }
    date = addDays(date, 1);
  }
  return Math.floor(totalMs / MINUTE_MS);
}

/** The calendar as the booking module asks it questions (its `WorkTime` port). */
export function createWorkTime(calendar: WorkCalendar) {
  return {
    intervals: (date: LocalDate): Interval[] => workIntervals(calendar, date),
    addWorkMinutes: (start: Date, minutes: number): Date | null =>
      addWorkMinutes(calendar, start, minutes),
    closedReason: (date: LocalDate): 'holiday' | 'day_off' | null => {
      if (calendar.holidays.has(date)) return 'holiday';
      return calendar.week[weekdayOf(date)] ? null : 'day_off';
    },
  };
}

/** Working minutes of the longest working day of the week: a job beyond it takes several days. */
export function longestWorkdayMinutes(calendar: WorkCalendar): number {
  // 2026-10-26 is a Monday: any week would do, as the hours depend only on the weekday.
  const monday = '2026-10-26';
  let longest = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(monday, offset);
    const minutes = workIntervals({ ...calendar, holidays: new Set() }, date).reduce(
      (sum, interval) => sum + (interval.end.getTime() - interval.start.getTime()) / MINUTE_MS,
      0,
    );
    longest = Math.max(longest, minutes);
  }
  return longest;
}
