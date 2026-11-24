/**
 * Words of the shop (docs/PLAN.md, sections 7.15 and 9.5). The database enums repeat these values.
 */

export const SHOP_ORDER_STATUSES = [
  'new',
  'confirmed',
  'ready_for_pickup',
  'completed',
  'cancelled',
] as const;
export type ShopOrderStatus = (typeof SHOP_ORDER_STATUSES)[number];

/** Still to be picked up: what "Faol" shows and what holds a reserve. */
export const ACTIVE_SHOP_ORDER_STATUSES = [
  'new',
  'confirmed',
  'ready_for_pickup',
] as const satisfies readonly ShopOrderStatus[];

/** `tma`: the client ordered in the Mini App; `counter`: a quick sale at the counter. */
export const SHOP_ORDER_SOURCES = ['tma', 'counter'] as const;
export type ShopOrderSource = (typeof SHOP_ORDER_SOURCES)[number];

/** Picked up at the workshop, or handed over with a car (stage 10). */
export const SHOP_FULFILLMENTS = ['pickup', 'with_service'] as const;
export type ShopFulfillment = (typeof SHOP_FULFILLMENTS)[number];

/** What a client sees instead of the exact stock (TZ 4.5). */
export const AVAILABILITIES = ['in_stock', 'low', 'out'] as const;
export type ProductAvailability = (typeof AVAILABILITIES)[number];

/** The tabs of the panel's shop orders (design A9). */
export const SHOP_ORDER_TABS = ['new', 'confirmed', 'ready_for_pickup', 'done'] as const;
export type ShopOrderTab = (typeof SHOP_ORDER_TABS)[number];

export const SHOP_SORTS = ['popular', 'price_asc', 'price_desc'] as const;
export type ShopSort = (typeof SHOP_SORTS)[number];
