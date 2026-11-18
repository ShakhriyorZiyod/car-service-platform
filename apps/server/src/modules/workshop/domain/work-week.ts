import type { WorkDay } from './working-time';

/** What the owner enters as the working hours of the week (docs/PLAN.md, section 7.4). */

export interface WorkDayEntry extends WorkDay {
  /** 1 = Monday … 7 = Sunday. */
  weekday: number;
}

export type WorkDayProblem =
  | 'weekday_invalid'
  | 'weekday_repeated'
  | 'close_not_after_open'
  | 'break_incomplete'
  | 'break_outside_hours';

export interface WorkWeekProblem {
  /** Which entry of the list. */
  index: number;
  problem: WorkDayProblem;
}

/**
 * Everything wrong with a week, so a form can mark every entry at once. The database enforces the
 * same on one row (CHECK constraints); this is the answer the owner gets before it comes to that.
 * Times are "HH:mm", which compares correctly as text.
 */
export function workWeekProblems(days: readonly WorkDayEntry[]): WorkWeekProblem[] {
  const problems: WorkWeekProblem[] = [];
  const seen = new Set<number>();

  days.forEach((day, index) => {
    if (!Number.isInteger(day.weekday) || day.weekday < 1 || day.weekday > 7) {
      problems.push({ index, problem: 'weekday_invalid' });
    } else if (seen.has(day.weekday)) {
      problems.push({ index, problem: 'weekday_repeated' });
    }
    seen.add(day.weekday);

    if (day.close <= day.open) {
      problems.push({ index, problem: 'close_not_after_open' });
      return;
    }
    if ((day.breakStart === null) !== (day.breakEnd === null)) {
      problems.push({ index, problem: 'break_incomplete' });
    } else if (day.breakStart !== null && day.breakEnd !== null) {
      const inside =
        day.breakStart >= day.open && day.breakEnd <= day.close && day.breakEnd > day.breakStart;
      if (!inside) problems.push({ index, problem: 'break_outside_hours' });
    }
  });
  return problems;
}

/** The working week as the calendar uses it. */
export function weekOf(days: readonly WorkDayEntry[]): Partial<Record<number, WorkDay>> {
  const week: Partial<Record<number, WorkDay>> = {};
  for (const { weekday, ...day } of days) week[weekday] = day;
  return week;
}
