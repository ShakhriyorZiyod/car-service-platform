import type { AdminRoutes } from '../../../http/contexts';
import type { ScheduleService } from '../../booking';
import type { AdminOrdersService } from '../app/admin-orders';

/** Thin adapters: each handler only passes the validated input to a use case. */

export const adminOrdersRoutes = (
  orders: AdminOrdersService,
  schedule: ScheduleService,
): Pick<
  AdminRoutes,
  | 'admin.cancelReasons'
  | 'admin.orders'
  | 'admin.order'
  | 'admin.createOrder'
  | 'admin.callOrder'
  | 'admin.updateOrderItems'
  | 'admin.rescheduleOrder'
  | 'admin.cancelOrder'
  | 'admin.noShow'
  | 'admin.setDiscount'
  | 'admin.priceItem'
  | 'admin.availability'
  | 'admin.slots'
  | 'admin.schedule'
  | 'admin.createBlock'
  | 'admin.removeBlock'
> => ({
  'admin.cancelReasons': async (_input, { actor }) => ({
    items: await orders.cancelReasons(actor),
  }),
  'admin.orders': async ({ query }, { actor }) => ({ items: await orders.list(actor, query) }),
  'admin.order': ({ params }, { actor }) => orders.get(actor, params.id),
  'admin.createOrder': ({ body }, { actor, ip }) =>
    orders.create(actor, { ...body, startsAt: new Date(body.startsAt) }, ip),
  'admin.callOrder': ({ params, body }, { actor }) => orders.call(actor, params.id, body),
  'admin.updateOrderItems': ({ params, body }, { actor, ip }) =>
    orders.updateItems(actor, params.id, body.items, ip),
  'admin.rescheduleOrder': ({ params, body }, { actor, ip }) =>
    orders.reschedule(actor, params.id, new Date(body.startsAt), ip),
  'admin.cancelOrder': ({ params, body }, { actor, ip }) =>
    orders.cancel(actor, params.id, body, ip),
  'admin.noShow': ({ params }, { actor, ip }) => orders.noShow(actor, params.id, ip),
  'admin.setDiscount': ({ params, body }, { actor, ip }) =>
    orders.setDiscount(
      actor,
      params.id,
      body.kind === 'none'
        ? null
        : {
            input:
              body.kind === 'percent'
                ? { kind: 'percent', percent: body.percent }
                : { kind: 'amount', amount: body.amount },
            reason: body.reason,
          },
      ip,
    ),
  'admin.priceItem': ({ params, body }, { actor, ip }) =>
    orders.priceItem(actor, params.id, params.itemId, body.price, ip),
  'admin.availability': ({ query }, { actor }) => orders.availability(actor, query),
  'admin.slots': ({ query }, { actor }) => orders.slots(actor, query),

  'admin.schedule': ({ query }, { actor }) => schedule.day(actor, query.date),
  'admin.createBlock': ({ body }, { actor, ip }) =>
    schedule.createBlock(
      actor,
      {
        boxId: body.boxId,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        note: body.note,
      },
      ip,
    ),
  'admin.removeBlock': async ({ params }, { actor, ip }) => {
    await schedule.removeBlock(actor, params.id, ip);
    return { ok: true };
  },
});
