import type { AdminRoutes, ClientRoutes } from '../../../http/contexts';
import type { ShopService } from '../app/shop';

/** Thin adapters: each handler only passes the validated input to a use case. */

export const shopClientRoutes = (
  shop: ShopService,
): Pick<
  ClientRoutes,
  | 'client.shopCategories'
  | 'client.shopProducts'
  | 'client.shopProduct'
  | 'client.shopQuote'
  | 'client.createShopOrder'
  | 'client.shopOrders'
  | 'client.shopOrder'
  | 'client.cancelShopOrder'
> => ({
  'client.shopCategories': async () => ({ items: await shop.categories() }),
  'client.shopProducts': async ({ query }) => ({
    items: await shop.products({
      categoryId: query.categoryId,
      q: query.q,
      inStock: query.inStock === undefined ? undefined : query.inStock === 'true',
      sort: query.sort,
    }),
  }),
  'client.shopProduct': ({ params }) => shop.product(params.id),
  'client.shopQuote': ({ body }) => shop.quote(body.items),
  'client.createShopOrder': ({ body }, { actor }) => shop.create(actor, body),
  'client.shopOrders': async ({ query }, { actor }) => ({
    items: await shop.list(actor, query.tab),
  }),
  'client.shopOrder': ({ params }, { actor }) => shop.get(actor, params.id),
  'client.cancelShopOrder': ({ params, body }, { actor }) => shop.cancel(actor, params.id, body),
});

export const shopAdminRoutes = (
  shop: ShopService,
): Pick<
  AdminRoutes,
  | 'admin.shopOrders'
  | 'admin.shopOrder'
  | 'admin.shopOrderCall'
  | 'admin.shopOrderReady'
  | 'admin.cancelShopOrder'
  | 'admin.setShopDiscount'
  | 'admin.shopCheckout'
  | 'admin.quickSale'
  | 'admin.saleProducts'
> => ({
  'admin.shopOrders': async ({ query }, { actor }) => ({
    items: await shop.staffList(actor, query),
  }),
  'admin.shopOrder': ({ params }, { actor }) => shop.staffGet(actor, params.id),
  'admin.shopOrderCall': ({ params, body }, { actor, ip }) => shop.call(actor, params.id, body, ip),
  'admin.shopOrderReady': ({ params }, { actor, ip }) => shop.ready(actor, params.id, ip),
  'admin.cancelShopOrder': ({ params, body }, { actor, ip }) =>
    shop.staffCancel(actor, params.id, body, ip),
  'admin.setShopDiscount': ({ params, body }, { actor, ip }) =>
    shop.setDiscount(actor, params.id, body, ip),
  'admin.shopCheckout': ({ params, body }, { actor, ip }) =>
    shop.checkout(actor, params.id, body, ip),
  'admin.quickSale': ({ body }, { actor, ip }) => shop.quickSale(actor, body, ip),
  'admin.saleProducts': async (_input, { actor }) => ({ items: await shop.saleProducts(actor) }),
});
