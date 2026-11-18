import type { ClientRoutes } from '../../../http/contexts';
import type { OrdersService } from '../app/orders';

/** Thin adapters: each handler only passes the validated input to a use case. */

export const ordersClientRoutes = (
  orders: OrdersService,
): Pick<
  ClientRoutes,
  | 'client.quote'
  | 'client.availability'
  | 'client.slots'
  | 'client.createOrder'
  | 'client.orders'
  | 'client.order'
  | 'client.cancelOrder'
  | 'client.requestReschedule'
  | 'client.review'
> => ({
  'client.quote': ({ body }, { actor }) => orders.quote(actor, body),
  'client.availability': ({ query }, { actor }) => orders.availability(actor, query),
  'client.slots': ({ query }, { actor }) => orders.slots(actor, query),
  'client.createOrder': ({ body }, { actor }) =>
    orders.create(actor, { ...body, startsAt: new Date(body.startsAt) }),
  'client.orders': async ({ query }, { actor }) => ({ items: await orders.list(actor, query.tab) }),
  'client.order': ({ params }, { actor }) => orders.get(actor, params.id),
  'client.cancelOrder': ({ params, body }, { actor }) => orders.cancel(actor, params.id, body),
  'client.requestReschedule': ({ params }, { actor }) => orders.requestReschedule(actor, params.id),
  'client.review': ({ params, body }, { actor }) => orders.review(actor, params.id, body),
});
