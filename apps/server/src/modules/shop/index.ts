/**
 * The shop module (docs/PLAN.md, sections 4.2, 7.15, 9.5 and 11; stage 9): the client's catalog,
 * cart and orders, and the panel's queue, handover and quick sale. The goods and their stock are
 * the stock module's; the money goes through the payments module.
 */
import { createShopService, type ShopDeps, type ShopService } from './app/shop';

export function createShop(deps: ShopDeps): ShopService {
  return createShopService(deps);
}

export type { ShopService } from './app/shop';
export { shopAdminRoutes, shopClientRoutes } from './http/routes';
