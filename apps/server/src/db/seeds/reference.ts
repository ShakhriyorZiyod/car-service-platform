import { sql } from 'drizzle-orm';
import type { Db, Tx } from '../client';
import {
  cancelReasons,
  carBrands,
  carModels,
  productCategories,
  serviceExcludes,
  services,
  serviceTypes,
} from '../schema';
import { CANCEL_REASONS, CAR_BRANDS, PRODUCT_CATEGORIES, SERVICE_TYPES } from './reference-data';

/**
 * `npm run seed:reference` (docs/PLAN.md, section 18, stages 2 and 8): the starting reference data
 * of TZ 14.1, 14.2, 14.3 and 14.4. Safe in production and safe to run again.
 *
 * Each group is written only into an empty table. Once the owner has edited a group in the panel it
 * is theirs: running the seed again does not bring back what they renamed or hid, and it does not
 * touch their prices.
 */

export interface ReferenceSeedReport {
  brands: number;
  models: number;
  serviceTypes: number;
  zones: number;
  excludes: number;
  cancelReasons: number;
  productCategories: number;
}

/** Two seeds at once (a deploy running twice) take turns instead of writing the data twice. */
const SEED_LOCK = 'cs:seed:reference';

const isEmpty = async (
  tx: Tx,
  table: typeof carBrands | typeof serviceTypes | typeof cancelReasons | typeof productCategories,
) => (await tx.select({ id: table.id }).from(table).limit(1)).length === 0;

export async function seedReference(db: Db): Promise<ReferenceSeedReport> {
  const report: ReferenceSeedReport = {
    brands: 0,
    models: 0,
    serviceTypes: 0,
    zones: 0,
    excludes: 0,
    cancelReasons: 0,
    productCategories: 0,
  };

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${SEED_LOCK}))`);

    if (await isEmpty(tx, carBrands)) {
      for (const [brandIndex, brand] of CAR_BRANDS.entries()) {
        const [inserted] = await tx
          .insert(carBrands)
          .values({ name: brand.name, sort: brandIndex + 1 })
          .returning({ id: carBrands.id });
        if (!inserted) throw new Error('insert returned no row');
        await tx.insert(carModels).values(
          brand.models.map(([name, bodyClass], modelIndex) => ({
            brandId: inserted.id,
            name,
            bodyClass,
            sort: modelIndex + 1,
          })),
        );
        report.brands += 1;
        report.models += brand.models.length;
      }
    }

    if (await isEmpty(tx, serviceTypes)) {
      for (const [typeIndex, type] of SERVICE_TYPES.entries()) {
        const [insertedType] = await tx
          .insert(serviceTypes)
          .values({
            code: type.code,
            nameUz: type.nameUz,
            nameRu: type.nameRu,
            icon: type.icon,
            sort: typeIndex + 1,
          })
          .returning({ id: serviceTypes.id });
        if (!insertedType) throw new Error('insert returned no row');

        const insertedZones = await tx
          .insert(services)
          .values(
            type.zones.map((zone, zoneIndex) => ({
              serviceTypeId: insertedType.id,
              nameUz: zone.nameUz,
              nameRu: zone.nameRu,
              group: zone.group,
              isCustom: zone.isCustom ?? false,
              sort: zoneIndex + 1,
            })),
          )
          .returning({ id: services.id, nameUz: services.nameUz });
        const idOf = new Map(insertedZones.map((zone) => [zone.nameUz, zone.id]));

        const links = type.zones.flatMap((zone) =>
          (zone.excludes ?? []).map((excludedName) => {
            const serviceId = idOf.get(zone.nameUz);
            const excludedServiceId = idOf.get(excludedName);
            if (!serviceId || !excludedServiceId) {
              throw new Error(`${type.code}: "${zone.nameUz}" excludes unknown "${excludedName}"`);
            }
            return { serviceId, excludedServiceId };
          }),
        );
        if (links.length > 0) await tx.insert(serviceExcludes).values(links);

        report.serviceTypes += 1;
        report.zones += type.zones.length;
        report.excludes += links.length;
      }
    }

    if (await isEmpty(tx, cancelReasons)) {
      await tx.insert(cancelReasons).values(
        CANCEL_REASONS.map((reason, index) => ({
          code: reason.code,
          nameUz: reason.nameUz,
          nameRu: reason.nameRu,
          appliesTo: reason.appliesTo,
          requiresText: reason.requiresText ?? false,
          sort: index + 1,
        })),
      );
      report.cancelReasons = CANCEL_REASONS.length;
    }

    if (await isEmpty(tx, productCategories)) {
      for (const [index, category] of PRODUCT_CATEGORIES.entries()) {
        const [parent] = await tx
          .insert(productCategories)
          .values({ nameUz: category.nameUz, nameRu: category.nameRu, sort: index + 1 })
          .returning({ id: productCategories.id });
        if (!parent) throw new Error('insert returned no row');
        const children = category.children ?? [];
        if (children.length > 0) {
          await tx.insert(productCategories).values(
            children.map((child, childIndex) => ({
              parentId: parent.id,
              nameUz: child.nameUz,
              nameRu: child.nameRu,
              sort: childIndex + 1,
            })),
          );
        }
        report.productCategories += 1 + children.length;
      }
    }
  });

  return report;
}
