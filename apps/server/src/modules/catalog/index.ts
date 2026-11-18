/**
 * The catalog module (docs/PLAN.md, sections 4.2 and 7.5): brands and models with their body
 * classes, kinds of work with their zones, the price matrix, and the reasons for cancelling.
 */
import type { PlatformDeps } from '../../platform/deps';
import type { AuditService } from '../audit';
import { createBrandsService, type BrandsService } from './app/brands';
import { createOffersService, type OffersService } from './app/offers';
import { createServicesService, type ServicesService } from './app/services';

export interface CatalogDeps extends PlatformDeps {
  audit: AuditService;
}

export interface CatalogService {
  brands: BrandsService;
  services: ServicesService;
  /** What other modules and clients read from the price list. */
  offers: OffersService;
}

export function createCatalogService(deps: CatalogDeps): CatalogService {
  return {
    brands: createBrandsService(deps),
    services: createServicesService(deps),
    offers: createOffersService(deps),
  };
}

export type { BrandsService } from './app/brands';
export type { ServicesService } from './app/services';
export type { OffersService, ZoneOffer } from './app/offers';
export { catalogAdminRoutes, catalogClientRoutes, catalogStaffRoutes } from './http/routes';
