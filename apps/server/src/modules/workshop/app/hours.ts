import type { Holiday, WorkDay, WorkHours } from '@cs/shared';
import { asc, eq } from 'drizzle-orm';
import type { DbOrTx } from '../../../db/client';
import { holidays, workHours } from '../../../db/schema';
import { requirePermission, type StaffActor } from '../../../platform/actors';
import type { PlatformDeps } from '../../../platform/deps';
import { AppError } from '../../../platform/errors';
import type { AuditService } from '../../audit';
import { weekOf, workWeekProblems, type WorkDayProblem } from '../domain/work-week';
import type { WorkCalendar } from '../domain/working-time';

/** Working hours of the week and the holidays (docs/PLAN.md, section 7.4). The owner's. */

export interface HoursServiceDeps extends PlatformDeps {
  audit: AuditService;
}

export interface HoursService {
  get(actor: StaffActor): Promise<WorkHours>;
  /** Replaces the whole week; a weekday that is not in `days` becomes a day off. */
  replaceWeek(actor: StaffActor, days: readonly WorkDay[], ip?: string): Promise<WorkHours>;
  /** A holiday on a date that already is one is renamed. */
  addHoliday(actor: StaffActor, holiday: Holiday, ip?: string): Promise<Holiday>;
  removeHoliday(actor: StaffActor, date: string, ip?: string): Promise<void>;
  /** The workshop's calendar for other modules' use cases. No permission check. */
  calendar(db?: DbOrTx): Promise<WorkCalendar>;
}

/** The form field a problem belongs to, for marking it. */
const PROBLEM_FIELD: Record<WorkDayProblem, keyof WorkDay> = {
  weekday_invalid: 'weekday',
  weekday_repeated: 'weekday',
  close_not_after_open: 'close',
  break_incomplete: 'breakStart',
  break_outside_hours: 'breakStart',
};

/** PostgreSQL's `time` comes back as "HH:MM:SS"; the API speaks "HH:mm". */
const hhmm = (time: string): string => time.slice(0, 5);

export function createHoursService(deps: HoursServiceDeps): HoursService {
  const { db, audit } = deps;

  async function read(from: DbOrTx): Promise<WorkHours> {
    // One query after another: a transaction has a single connection.
    const dayRows = await from.select().from(workHours).orderBy(asc(workHours.weekday));
    const holidayRows = await from.select().from(holidays).orderBy(asc(holidays.date));
    return {
      days: dayRows.map((row) => ({
        weekday: row.weekday,
        open: hhmm(row.open),
        close: hhmm(row.close),
        breakStart: row.breakStart === null ? null : hhmm(row.breakStart),
        breakEnd: row.breakEnd === null ? null : hhmm(row.breakEnd),
      })),
      holidays: holidayRows.map((row) => ({ date: row.date, name: row.name })),
    };
  }

  return {
    async calendar(from = db) {
      const { days, holidays: dates } = await read(from);
      return { week: weekOf(days), holidays: new Set(dates.map((holiday) => holiday.date)) };
    },

    async get(actor) {
      requirePermission(actor, 'settings.write');
      return read(db);
    },

    async replaceWeek(actor, days, ip) {
      requirePermission(actor, 'settings.write');
      const problems = workWeekProblems(days);
      if (problems.length > 0) {
        throw new AppError('validation', 'invalid working hours', {
          paths: problems.map(
            ({ index, problem }) => `body.days.${index}.${PROBLEM_FIELD[problem]}`,
          ),
        });
      }
      // In the order and shape `read` gives, so "nothing changed" is a plain comparison.
      const next: WorkDay[] = days
        .map(({ weekday, open, close, breakStart, breakEnd }) => ({
          weekday,
          open,
          close,
          breakStart,
          breakEnd,
        }))
        .sort((a, b) => a.weekday - b.weekday);

      return db.transaction(async (tx) => {
        // The week is read under a lock, so two saves at once do not mix their rows.
        await tx.select().from(workHours).for('update');
        const before = (await read(tx)).days;
        if (JSON.stringify(before) === JSON.stringify(next)) return read(tx);

        await tx.delete(workHours);
        if (next.length > 0) await tx.insert(workHours).values(next);
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'work_hours.update',
          entity: 'work_hours',
          before,
          after: next,
          ip: ip ?? null,
        });
        return read(tx);
      });
    },

    async addHoliday(actor, holiday, ip) {
      requirePermission(actor, 'settings.write');
      await db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(holidays)
          .where(eq(holidays.date, holiday.date))
          .for('update');
        if (before?.name === holiday.name) return;
        await tx
          .insert(holidays)
          .values(holiday)
          .onConflictDoUpdate({ target: holidays.date, set: { name: holiday.name } });
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'holiday.add',
          entity: 'holiday',
          entityId: holiday.date,
          before: before ?? null,
          after: holiday,
          ip: ip ?? null,
        });
      });
      return holiday;
    },

    async removeHoliday(actor, date, ip) {
      requirePermission(actor, 'settings.write');
      await db.transaction(async (tx) => {
        const [removed] = await tx.delete(holidays).where(eq(holidays.date, date)).returning();
        if (!removed) throw new AppError('not_found');
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'holiday.remove',
          entity: 'holiday',
          entityId: date,
          before: removed,
          ip: ip ?? null,
        });
      });
    },
  };
}
