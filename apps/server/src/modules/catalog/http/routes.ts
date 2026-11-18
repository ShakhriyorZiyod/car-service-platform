import type { AdminRoutes, ClientRoutes } from '../../../http/contexts';
import type { OffersService } from '../app/offers';
import type { BrandsService } from '../app/brands';
import type { ServicesService } from '../app/services';

/** Thin adapters: each handler only passes the validated input to a use case. */

export const catalogAdminRoutes = (services: {
  brands: BrandsService;
  services: ServicesService;
}): Pick<
  AdminRoutes,
  | 'admin.brands'
  | 'admin.createBrand'
  | 'admin.updateBrand'
  | 'admin.createModel'
  | 'admin.updateModel'
  | 'admin.serviceTypes'
  | 'admin.createServiceType'
  | 'admin.updateServiceType'
  | 'admin.prices'
  | 'admin.updatePrices'
  | 'admin.createService'
  | 'admin.updateService'
> => {
  const { brands } = services;
  const zones = services.services;
  return {
    'admin.brands': async (_input, { actor }) => ({ items: await brands.list(actor) }),
    'admin.createBrand': ({ body }, { actor, ip }) => brands.createBrand(actor, body, ip),
    'admin.updateBrand': ({ params, body }, { actor, ip }) =>
      brands.updateBrand(actor, params.id, body, ip),
    'admin.createModel': ({ body }, { actor, ip }) => brands.createModel(actor, body, ip),
    'admin.updateModel': ({ params, body }, { actor, ip }) =>
      brands.updateModel(actor, params.id, body, ip),

    'admin.serviceTypes': async (_input, { actor }) => ({ items: await zones.listTypes(actor) }),
    'admin.createServiceType': ({ body }, { actor, ip }) => zones.createType(actor, body, ip),
    'admin.updateServiceType': ({ params, body }, { actor, ip }) =>
      zones.updateType(actor, params.id, body, ip),
    'admin.prices': ({ params }, { actor }) => zones.prices(actor, params.serviceTypeId),
    'admin.updatePrices': ({ params, body }, { actor, ip }) =>
      zones.updatePrices(actor, params.serviceTypeId, body.cells, ip),
    'admin.createService': ({ body }, { actor, ip }) => zones.createService(actor, body, ip),
    'admin.updateService': ({ params, body }, { actor, ip }) =>
      zones.updateService(actor, params.id, body, ip),
  };
};

export const catalogClientRoutes = (
  offers: OffersService,
): Pick<ClientRoutes, 'client.catalog'> => ({
  'client.catalog': () => offers.clientCatalog(),
});

export const catalogStaffRoutes = (offers: OffersService): Pick<AdminRoutes, 'admin.catalog'> => ({
  'admin.catalog': (_input, { actor }) => offers.staffCatalog(actor),
});
