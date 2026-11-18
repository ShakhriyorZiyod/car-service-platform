import type { AdminRoutes, ClientRoutes } from '../../../http/contexts';
import type { GarageService } from '../app/cars';

/** Thin adapters: each handler only passes the validated input to a use case. */

export const garageClientRoutes = (
  garage: GarageService,
): Pick<
  ClientRoutes,
  'client.cars' | 'client.createCar' | 'client.updateCar' | 'client.archiveCar'
> => ({
  'client.cars': async (_input, { actor }) => ({ items: await garage.list(actor) }),
  'client.createCar': ({ body }, { actor }) => garage.create(actor, body),
  'client.updateCar': ({ params, body }, { actor }) => garage.update(actor, params.id, body),
  'client.archiveCar': async ({ params }, { actor }) => {
    await garage.archive(actor, params.id);
    return { ok: true };
  },
});

export const garageAdminRoutes = (
  garage: GarageService,
): Pick<AdminRoutes, 'admin.unmappedCars' | 'admin.mapCar'> => ({
  'admin.unmappedCars': async (_input, { actor }) => ({ items: await garage.unmapped(actor) }),
  'admin.mapCar': ({ params, body }, { actor, ip }) => garage.map(actor, params.id, body, ip),
});
