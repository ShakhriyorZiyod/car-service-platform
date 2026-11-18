import type { Schedule } from '@cs/shared';
import { and, asc, eq, gt, isNull, lt } from 'drizzle-orm';
import { bookings, boxes, orders, users } from '../../../db/schema';
import { addDays, instantAt, localDateOf, presentInstant, weekdayOf } from '../../../lib/time';
import { requirePermission, type StaffActor } from '../../../platform/actors';
import type { PlatformDeps } from '../../../platform/deps';
import { AppError, invalidAt } from '../../../platform/errors';
import { isExclusionViolation, isMissingReference } from '../../../platform/pg-errors';
import type { AuditService } from '../../audit';
import type { WorkshopService } from '../../workshop';

/**
 * The day's table of boxes and the blocks the admin puts on it (docs/PLAN.md, sections 7.7, 10.4;
 * design A4). A block holds a box like an order does, and the same constraint guards both.
 */

export interface ScheduleServiceDeps extends PlatformDeps {
  workshop: Pick<WorkshopService, 'hours'>;
  audit: AuditService;
}

export interface NewBlock {
  boxId: string;
  startsAt: Date;
  endsAt: Date;
  note: string;
}

export interface ScheduleService {
  /** One day of the table; no date means today. */
  day(actor: StaffActor, date?: string): Promise<Schedule>;
  /** Refused with `slot_taken` when anything already holds the box over that time. */
  createBlock(actor: StaffActor, input: NewBlock, ip?: string): Promise<{ id: string }>;
  removeBlock(actor: StaffActor, id: string, ip?: string): Promise<void>;
}

const hhmm = (time: string | null): string | null => (time === null ? null : time.slice(0, 5));

export function createScheduleService(deps: ScheduleServiceDeps): ScheduleService {
  const { db, clock, audit, workshop } = deps;

  return {
    async day(actor, requested) {
      requirePermission(actor, 'schedule.read');
      const now = clock.now();
      const date = requested ?? localDateOf(now);
      const dayStart = instantAt(date, '00:00');
      const dayEnd = instantAt(addDays(date, 1), '00:00');
      const calendar = await workshop.hours.calendar(db);

      const activeBoxes = await db
        .select()
        .from(boxes)
        .where(eq(boxes.isActive, true))
        .orderBy(asc(boxes.sort), asc(boxes.name));
      const rows = await db
        .select({
          id: bookings.id,
          boxId: bookings.boxId,
          kind: bookings.kind,
          startsAt: bookings.startsAt,
          endsAt: bookings.endsAt,
          note: bookings.note,
          orderId: orders.id,
          number: orders.number,
          status: orders.status,
          snapshot: orders.carSnapshot,
          clientName: users.fullName,
        })
        .from(bookings)
        .leftJoin(orders, eq(orders.id, bookings.orderId))
        .leftJoin(users, eq(users.id, orders.clientId))
        .where(
          and(
            isNull(bookings.releasedAt),
            lt(bookings.startsAt, dayEnd),
            gt(bookings.endsAt, dayStart),
          ),
        )
        .orderBy(asc(bookings.startsAt));

      const hours = calendar.week[weekdayOf(date)];
      const closedReason = calendar.holidays.has(date) ? 'holiday' : hours ? null : 'day_off';
      return {
        date,
        now: presentInstant(now),
        hours:
          hours && closedReason === null
            ? {
                open: hhmm(hours.open) ?? hours.open,
                close: hhmm(hours.close) ?? hours.close,
                breakStart: hhmm(hours.breakStart),
                breakEnd: hhmm(hours.breakEnd),
              }
            : null,
        closedReason,
        boxes: activeBoxes.map((box) => ({
          id: box.id,
          name: box.name,
          items: rows
            .filter((row) => row.boxId === box.id)
            .map((row) => {
              const snapshot = row.snapshot as { label?: string; plate?: string } | null;
              return {
                id: row.id,
                kind: row.kind,
                startsAt: presentInstant(row.startsAt),
                endsAt: presentInstant(row.endsAt),
                note: row.note,
                order:
                  row.kind === 'order' && row.orderId && row.number !== null && row.status
                    ? {
                        id: row.orderId,
                        number: row.number,
                        status: row.status,
                        clientName: row.clientName ?? '',
                        carLabel: snapshot?.label ?? '',
                        plate: snapshot?.plate ?? '',
                      }
                    : null,
              };
            }),
        })),
      };
    },

    async createBlock(actor, input, ip) {
      requirePermission(actor, 'schedule.write');
      if (input.endsAt <= input.startsAt) throw invalidAt('body.endsAt', 'must be after the start');
      try {
        return await db.transaction(async (tx) => {
          // A plain insert: the constraint refuses an overlap with an order or another block.
          const [block] = await tx
            .insert(bookings)
            .values({
              kind: 'block',
              boxId: input.boxId,
              startsAt: input.startsAt,
              endsAt: input.endsAt,
              note: input.note,
              createdBy: actor.userId,
            })
            .returning({ id: bookings.id });
          if (!block) throw new Error('insert returned no row');
          await audit.record(tx, {
            actorId: actor.userId,
            action: 'block.create',
            entity: 'booking',
            entityId: block.id,
            after: {
              boxId: input.boxId,
              startsAt: input.startsAt.toISOString(),
              endsAt: input.endsAt.toISOString(),
              note: input.note,
            },
            ip: ip ?? null,
          });
          return { id: block.id };
        });
      } catch (error) {
        if (isMissingReference(error)) throw invalidAt('body.boxId', 'unknown box');
        // The box is held over this time (docs/PLAN.md, section 2, rule 5).
        if (isExclusionViolation(error)) throw new AppError('slot_taken');
        throw error;
      }
    },

    async removeBlock(actor, id, ip) {
      requirePermission(actor, 'schedule.write');
      await db.transaction(async (tx) => {
        const [removed] = await tx
          .update(bookings)
          .set({ releasedAt: clock.now(), releaseReason: 'block_removed' })
          .where(and(eq(bookings.id, id), eq(bookings.kind, 'block'), isNull(bookings.releasedAt)))
          .returning({ id: bookings.id, boxId: bookings.boxId, note: bookings.note });
        if (!removed) throw new AppError('not_found');
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'block.remove',
          entity: 'booking',
          entityId: id,
          before: { boxId: removed.boxId, note: removed.note },
          ip: ip ?? null,
        });
      });
    },
  };
}
