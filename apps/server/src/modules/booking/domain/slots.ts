import { addDays, localDateOf, type LocalDate } from '../../../lib/time';

/**
 * Free times for a job (docs/PLAN.md, sections 10.2 and 10.3). Pure: the working hours, the boxes
 * and what is already booked arrive as arguments, and `now` is a parameter.
 *
 * `W`, the working minutes a job occupies a box, is the sum of its zones' minutes plus the buffer
 * between cars; the orders module adds it up.
 */

export interface Interval {
  start: Date;
  end: Date;
}

/** What booking asks of the workshop's calendar; `workshop` provides it (createWorkTime). */
export interface WorkTime {
  /** The working stretches of a date, in order; empty on a day off or a holiday. */
  intervals(date: LocalDate): Interval[];
  /** `minutes` of working time after `start`; null when there is no working time at all. */
  addWorkMinutes(start: Date, minutes: number): Date | null;
  closedReason(date: LocalDate): 'holiday' | 'day_off' | null;
}

export interface SlotRules {
  slotStepMin: number;
  minLeadMin: number;
  horizonDays: number;
}

/** A box that can do the job; the list arrives in the owner's order (`sort`). */
export interface BoxRef {
  id: string;
  name: string;
}

/** A stretch of a box that is held (an order's, or a block). */
export interface BusyStretch {
  boxId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface Slot {
  startsAt: Date;
  /** When the job is done and the box is free again. */
  endsAt: Date;
  free: boolean;
  /** The first box that is free for it; null when the slot is not free. */
  box: BoxRef | null;
}

export type DayState = 'free' | 'full' | 'closed';

export interface DayAvailability {
  date: LocalDate;
  state: DayState;
  /** Why the workshop is closed, when it is. */
  closedReason: 'holiday' | 'day_off' | null;
}

export interface JobPlan {
  /** `W`: working minutes the job occupies a box, buffer included. */
  workMinutes: number;
}

export interface Planning {
  now: Date;
  rules: SlotRules;
  time: WorkTime;
  boxes: readonly BoxRef[];
  busy: readonly BusyStretch[];
  job: JobPlan;
}

const MINUTE_MS = 60_000;

const minutesIn = (intervals: readonly Interval[]): number =>
  intervals.reduce(
    (sum, interval) => sum + (interval.end.getTime() - interval.start.getTime()),
    0,
  ) / MINUTE_MS;

const overlaps = (busy: BusyStretch, start: Date, end: Date): boolean =>
  busy.startsAt < end && busy.endsAt > start;

/**
 * Where a job may start on a date, ignoring who else is booked: every `slotStepMin` from opening,
 * not inside the break, and only if the job is done before closing. A job longer than one working
 * day starts only at opening and runs on over the next working days.
 */
function startsOn(date: LocalDate, planning: Planning): { start: Date; end: Date }[] {
  const { time, rules, job } = planning;
  const intervals = time.intervals(date);
  const first = intervals[0];
  const last = intervals.at(-1);
  if (!first || !last) return [];

  if (job.workMinutes > minutesIn(intervals)) {
    const end = time.addWorkMinutes(first.start, job.workMinutes);
    return end ? [{ start: first.start, end }] : [];
  }

  const starts: { start: Date; end: Date }[] = [];
  for (
    let at = first.start.getTime();
    at < last.end.getTime();
    at += rules.slotStepMin * MINUTE_MS
  ) {
    const start = new Date(at);
    if (!intervals.some((interval) => start >= interval.start && start < interval.end)) continue;
    const end = time.addWorkMinutes(start, job.workMinutes);
    if (end && end <= last.end) starts.push({ start, end });
  }
  return starts;
}

/** Every start time of a date with whether it is free, and in which box. */
export function daySlots(date: LocalDate, planning: Planning): Slot[] {
  const earliest = planning.now.getTime() + planning.rules.minLeadMin * MINUTE_MS;
  return startsOn(date, planning).map(({ start, end }) => {
    const box =
      start.getTime() < earliest
        ? undefined
        : planning.boxes.find(
            (candidate) =>
              !planning.busy.some(
                (held) => held.boxId === candidate.id && overlaps(held, start, end),
              ),
          );
    return { startsAt: start, endsAt: end, free: box !== undefined, box: box ?? null };
  });
}

/** The dates a client may book: today and the following days, `horizonDays` of them. */
export function horizonDates(now: Date, rules: SlotRules): LocalDate[] {
  const today = localDateOf(now);
  return Array.from({ length: rules.horizonDays }, (_unused, index) => addDays(today, index));
}

/** Each date of the horizon: free, full, or closed (with why). */
export function availability(planning: Planning): DayAvailability[] {
  return horizonDates(planning.now, planning.rules).map((date) => {
    const closedReason = planning.time.closedReason(date);
    if (closedReason) return { date, state: 'closed', closedReason };
    const free = daySlots(date, planning).some((slot) => slot.free);
    return { date, state: free ? 'free' : 'full', closedReason: null };
  });
}

/** The first free times from `from` on, for a client whose day is full (client PDF, page 18). */
export function nearestFreeSlots(from: LocalDate, count: number, planning: Planning): Slot[] {
  const found: Slot[] = [];
  for (const date of horizonDates(planning.now, planning.rules)) {
    if (date < from) continue;
    for (const slot of daySlots(date, planning)) {
      if (slot.free) found.push(slot);
      if (found.length >= count) return found;
    }
  }
  return found;
}

export type StartProblem = 'outside_horizon' | 'not_a_slot' | 'too_soon';

/**
 * Whether a start time chosen by a client is one the workshop offers at all, whoever is booked:
 * inside the horizon, on the step grid, not in the break, done before closing, and not sooner
 * than the lead time. Whether a box is free is for the database to say.
 */
export function checkStart(
  startsAt: Date,
  planning: Planning,
): { ok: true; endsAt: Date } | { ok: false; problem: StartProblem } {
  const date = localDateOf(startsAt);
  if (!horizonDates(planning.now, planning.rules).includes(date)) {
    return { ok: false, problem: 'outside_horizon' };
  }
  const slot = startsOn(date, planning).find(
    (candidate) => candidate.start.getTime() === startsAt.getTime(),
  );
  if (!slot) return { ok: false, problem: 'not_a_slot' };
  const earliest = planning.now.getTime() + planning.rules.minLeadMin * MINUTE_MS;
  if (startsAt.getTime() < earliest) return { ok: false, problem: 'too_soon' };
  return { ok: true, endsAt: slot.end };
}
