import { and, count, eq, gt, isNull, lte } from 'drizzle-orm';
import { bookings, orderCalls, orders, users } from '../../../db/schema';
import type { ScheduledTask } from '../../../platform/ports';
import type { PlatformDeps } from '../../../platform/deps';
import type { Outbox } from '../../../platform/outbox';
import type { StaffDirectory } from '../../../platform/ports';
import type { BookingService } from '../../booking';
import { workMinutesBetween, type WorkshopService } from '../../workshop';
import { callOverdue, reminderDue, reminderKey } from '../domain/followups';
import { createViews } from './views';

/**
 * What the system does on its own for orders, once a minute (docs/PLAN.md, sections 4.8 and 12):
 * tells the director and the owner about a request nobody called about, and reminds clients of
 * their visit. Each works out what to do from the data, and the outbox's key makes a repeat
 * harmless.
 */

export interface OrderTasksDeps extends PlatformDeps {
  workshop: Pick<WorkshopService, 'settings' | 'hours'>;
  booking: BookingService;
  outbox: Outbox;
  staff: StaffDirectory;
}

const HOUR_MS = 3_600_000;

export function createOrderTasks(deps: OrderTasksDeps): ScheduledTask[] {
  const { db, workshop, booking, outbox, staff } = deps;
  const { factsOf, bookingOf } = createViews(booking);

  const callSla: ScheduledTask = {
    name: 'call-sla',
    async run(now) {
      const waiting = await db.select().from(orders).where(eq(orders.status, 'new'));
      if (waiting.length === 0) return;
      const { rules } = await workshop.settings.current();
      const calendar = await workshop.hours.calendar();
      const bosses = await staff.recipients(db, ['director', 'owner']);

      for (const order of waiting) {
        const [called] = await db
          .select({ n: count() })
          .from(orderCalls)
          .where(eq(orderCalls.orderId, order.id));
        const waitingWorkMin = workMinutesBetween(calendar, order.createdAt, now);
        if (
          !callOverdue({
            status: order.status,
            calls: called?.n ?? 0,
            waitingWorkMin,
            thresholdMin: rules.callEscalateMin,
          })
        ) {
          continue;
        }
        const [client] = await db
          .select({ fullName: users.fullName })
          .from(users)
          .where(eq(users.id, order.clientId));
        const facts = await factsOf(db, order, await bookingOf(db, order.id));
        for (const boss of bosses) {
          await outbox.enqueue(db, {
            to: boss,
            notification: {
              type: 'staff.order_unanswered',
              ...facts,
              clientName: client?.fullName ?? '',
              waitingMin: waitingWorkMin,
            },
            dedupeKey: `unanswered:${order.id}:${boss.userId}`,
          });
        }
      }
    },
  };

  const reminders: ScheduledTask = {
    name: 'reminders',
    async run(now) {
      const { rules } = await workshop.settings.current();
      for (const hoursBefore of rules.reminderHours) {
        const horizon = new Date(now.getTime() + hoursBefore * HOUR_MS);
        const due = await db
          .select({
            order: orders,
            startsAt: bookings.startsAt,
            endsAt: bookings.endsAt,
            telegramId: users.telegramId,
            lang: users.lang,
            remindersEnabled: users.remindersEnabled,
          })
          .from(orders)
          .innerJoin(bookings, eq(bookings.orderId, orders.id))
          .innerJoin(users, eq(users.id, orders.clientId))
          .where(
            and(
              eq(orders.status, 'confirmed'),
              isNull(bookings.releasedAt),
              gt(bookings.startsAt, now),
              lte(bookings.startsAt, horizon),
            ),
          );

        for (const row of due) {
          if (row.telegramId === null) continue;
          const candidate = {
            status: row.order.status,
            confirmedAt: row.order.confirmedAt,
            startsAt: row.startsAt,
            remindersEnabled: row.remindersEnabled,
          };
          if (!reminderDue(candidate, hoursBefore, now)) continue;
          const facts = await factsOf(db, row.order, await bookingOf(db, row.order.id));
          await outbox.enqueue(db, {
            to: { userId: row.order.clientId, lang: row.lang },
            notification: { type: 'order.reminder', ...facts, hoursBefore },
            dedupeKey: reminderKey(row.order.id, hoursBefore, row.startsAt),
          });
        }
      }
    },
  };

  return [callSla, reminders];
}
