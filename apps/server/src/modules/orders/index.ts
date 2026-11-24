/**
 * The orders module (docs/PLAN.md, sections 4.2, 7.8 and 9.1). In stage 3 it prices and books the
 * client's orders, lists and tracks them, lets the client cancel or ask to move the time, and
 * cancels by itself the orders nobody called about. Its rules are pure (`domain/`).
 */
import type { ScheduledTask } from '../../platform/ports';
import {
  createAdminOrdersService,
  type AdminOrdersDeps,
  type AdminOrdersService,
} from './app/admin-orders';
import { createExtrasService, type ExtrasService } from './app/extras';
import { createOrdersService, type OrdersService, type OrdersServiceDeps } from './app/orders';
import { createOrderTasks } from './app/tasks';

export function createOrders(deps: OrdersServiceDeps & Pick<AdminOrdersDeps, 'audit'>): {
  service: OrdersService;
  admin: AdminOrdersService;
  extras: ExtrasService;
  tasks: ScheduledTask[];
} {
  const service = createOrdersService(deps);
  const admin = createAdminOrdersService(deps);
  return {
    service,
    admin,
    extras: createExtrasService({ ...deps, admin, client: service }),
    tasks: [
      ...createOrderTasks(deps),
      {
        name: 'expire-holds',
        run: async (now) => {
          const cancelled = await service.expireHolds(now);
          if (cancelled > 0) deps.logger.info({ cancelled }, 'orders cancelled: hold ran out');
        },
      },
    ],
  };
}

export type { AdminOrdersService, CheckoutState, TaskItem } from './app/admin-orders';
export { adminOrdersRoutes } from './http/admin-routes';
export type { ExtrasService } from './app/extras';
export { extrasBotHandlers, reviewBotHandlers } from './bot/handlers';
export { extrasAdminRoutes, extrasClientRoutes } from './http/extras-routes';
export type { OrdersService } from './app/orders';
/** The discount rule (PLAN 11), which the shop applies to its orders too. */
export { checkDiscount, type DiscountInput } from './domain/discount';
export { holdAfterNoAnswer } from './domain/hold';
export { ordersClientRoutes } from './http/routes';
