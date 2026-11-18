import type { Dashboard } from '@cs/shared';
import { localDateOf } from '../../../lib/time';
import { requirePermission, type StaffActor } from '../../../platform/actors';
import type { PlatformDeps } from '../../../platform/deps';
import type { AdminOrdersService } from '../../orders';
import type { PaymentsService } from '../../payments';
import type { TasksService } from '../../tasks';

/**
 * The "Bugun" screen (docs/PLAN.md, section 13; design A6): the orders' counters and the day's
 * visits, the reports waiting for a check, and the day's takings. It only reads, through the
 * modules that own the data.
 */

export interface DashboardDeps extends Pick<PlatformDeps, 'clock'> {
  orders: Pick<AdminOrdersService, 'today'>;
  tasks: Pick<TasksService, 'list'>;
  payments: Pick<PaymentsService, 'cashOf'>;
}

export interface DashboardService {
  today(actor: StaffActor): Promise<Dashboard>;
}

export function createDashboardService(deps: DashboardDeps): DashboardService {
  const { clock, orders, tasks, payments } = deps;
  return {
    async today(actor) {
      requirePermission(actor, 'today.read');
      const today = await orders.today(actor);
      const now = clock.now();
      // Who does not check reports or take money is not shown them.
      const reports = actor.permissions.has('tasks.review')
        ? await tasks.list(actor, { tab: 'review' })
        : [];
      const cash = actor.permissions.has('checkout.write')
        ? await payments.cashOf(localDateOf(now))
        : null;
      return {
        ...today,
        reports: reports.map((task) => ({
          ...task,
          waitingMin: task.submittedAt
            ? Math.max(0, Math.floor((now.getTime() - Date.parse(task.submittedAt.at)) / 60_000))
            : 0,
        })),
        cash,
      };
    },
  };
}
