import type { ClientCatalog } from '@cs/shared';
import { BODY_CLASSES, type BodyClass } from '@cs/shared/vocabulary';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '../../../db/client';
import {
  cancelReasons,
  carBrands,
  carModels,
  serviceExcludes,
  servicePrices,
  services,
  serviceTypes,
} from '../../../db/schema';
import { requirePermission, type StaffActor } from '../../../platform/actors';
import type { PlatformDeps } from '../../../platform/deps';

/**
 * What other modules and the client read from the price list (docs/PLAN.md, sections 7.5, 13):
 * the offer for chosen zones at a body class, and the catalog the Mini App shows. No permission
 * checks: these are for use cases that have already identified their caller.
 */

/** A zone as an order would take it: names to copy, what it removes, its price at one class. */
export interface ZoneOffer {
  serviceId: string;
  serviceTypeId: string;
  nameUz: string;
  nameRu: string;
  typeNameUz: string;
  typeNameRu: string;
  /** The zone and its kind of work are both in use. */
  isActive: boolean;
  isCustom: boolean;
  excludes: string[];
  /** Null when the zone is not offered for this class. */
  cell: { price: number | null; durationMin: number } | null;
}

export interface OffersService {
  /** The chosen zones with their price and time at `bodyClass`; unknown ids are left out. */
  offers(serviceIds: readonly string[], bodyClass: BodyClass, from?: DbOrTx): Promise<ZoneOffer[]>;
  /** Brands, models, kinds of work and zones in use, with prices by class. */
  clientCatalog(from?: DbOrTx): Promise<ClientCatalog>;
  /** The same catalog for the staff, who pick zones when they enter or change an order. */
  staffCatalog(actor: StaffActor): Promise<ClientCatalog>;
}

export function createOffersService(deps: Pick<PlatformDeps, 'db'>): OffersService {
  const { db } = deps;

  const service: OffersService = {
    async staffCatalog(actor) {
      requirePermission(actor, 'orders.read');
      return service.clientCatalog();
    },

    async offers(serviceIds, bodyClass, from = db) {
      const ids = [...new Set(serviceIds)];
      if (ids.length === 0) return [];
      const zones = await from
        .select({
          id: services.id,
          serviceTypeId: services.serviceTypeId,
          nameUz: services.nameUz,
          nameRu: services.nameRu,
          isActive: services.isActive,
          isCustom: services.isCustom,
          typeNameUz: serviceTypes.nameUz,
          typeNameRu: serviceTypes.nameRu,
          typeIsActive: serviceTypes.isActive,
        })
        .from(services)
        .innerJoin(serviceTypes, eq(serviceTypes.id, services.serviceTypeId))
        .where(inArray(services.id, ids));
      const prices = await from
        .select()
        .from(servicePrices)
        .where(and(inArray(servicePrices.serviceId, ids), eq(servicePrices.bodyClass, bodyClass)));
      const excludes = await from
        .select()
        .from(serviceExcludes)
        .where(inArray(serviceExcludes.serviceId, ids));
      return zones.map((zone) => {
        const cell = prices.find((price) => price.serviceId === zone.id);
        return {
          serviceId: zone.id,
          serviceTypeId: zone.serviceTypeId,
          nameUz: zone.nameUz,
          nameRu: zone.nameRu,
          typeNameUz: zone.typeNameUz,
          typeNameRu: zone.typeNameRu,
          isActive: zone.isActive && zone.typeIsActive,
          isCustom: zone.isCustom,
          excludes: excludes
            .filter((link) => link.serviceId === zone.id)
            .map((link) => link.excludedServiceId)
            .sort(),
          cell: cell ? { price: cell.price, durationMin: cell.durationMin } : null,
        };
      });
    },

    async clientCatalog(from = db) {
      const [brands, models, types, zones, prices, excludes, reasons] = await Promise.all([
        from
          .select()
          .from(carBrands)
          .where(eq(carBrands.isActive, true))
          .orderBy(asc(carBrands.sort), asc(carBrands.name)),
        from
          .select()
          .from(carModels)
          .where(eq(carModels.isActive, true))
          .orderBy(asc(carModels.sort), asc(carModels.name)),
        from
          .select()
          .from(serviceTypes)
          .where(eq(serviceTypes.isActive, true))
          .orderBy(asc(serviceTypes.sort), asc(serviceTypes.nameUz)),
        from
          .select()
          .from(services)
          .where(eq(services.isActive, true))
          .orderBy(asc(services.sort), asc(services.nameUz)),
        from.select().from(servicePrices),
        from.select().from(serviceExcludes),
        from
          .select()
          .from(cancelReasons)
          .where(and(eq(cancelReasons.isActive, true), eq(cancelReasons.appliesTo, 'client')))
          .orderBy(asc(cancelReasons.sort)),
      ]);
      const activeZoneIds = new Set(zones.map((zone) => zone.id));

      return {
        cancelReasons: reasons.map((reason) => ({
          id: reason.id,
          nameUz: reason.nameUz,
          nameRu: reason.nameRu,
          requiresText: reason.requiresText,
        })),
        brands: brands.map((brand) => ({
          id: brand.id,
          name: brand.name,
          models: models
            .filter((model) => model.brandId === brand.id)
            .map((model) => ({ id: model.id, name: model.name, bodyClass: model.bodyClass })),
        })),
        serviceTypes: types.map((type) => ({
          id: type.id,
          code: type.code,
          nameUz: type.nameUz,
          nameRu: type.nameRu,
          icon: type.icon,
          zones: zones
            .filter((zone) => zone.serviceTypeId === type.id)
            .map((zone) => ({
              id: zone.id,
              nameUz: zone.nameUz,
              nameRu: zone.nameRu,
              group: zone.group,
              isCustom: zone.isCustom,
              excludes: excludes
                .filter(
                  (link) => link.serviceId === zone.id && activeZoneIds.has(link.excludedServiceId),
                )
                .map((link) => link.excludedServiceId)
                .sort(),
              // Every class, so the app can show the price of the chosen car at once; the server
              // still prices the order itself.
              prices: BODY_CLASSES.flatMap((bodyClass) => {
                const cell = prices.find(
                  (price) => price.serviceId === zone.id && price.bodyClass === bodyClass,
                );
                return cell
                  ? [{ bodyClass, price: cell.price, durationMin: cell.durationMin }]
                  : [];
              }),
            })),
        })),
      };
    },
  };
  return service;
}
