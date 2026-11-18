/**
 * The garage module (docs/PLAN.md, sections 4.2 and 7.6): the client's cars, with the plate in one
 * stored form, and the check that stops a car with an order in progress from being archived.
 */
import { createGarageService, type GarageDeps, type GarageService } from './app/cars';

export function createGarage(deps: GarageDeps): GarageService {
  return createGarageService(deps);
}

export type { GarageService } from './app/cars';
export { carLabel } from './domain/car';
export { garageAdminRoutes, garageClientRoutes } from './http/routes';
