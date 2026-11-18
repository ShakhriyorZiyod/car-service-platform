import type { CarBrand, CarModel } from '@cs/shared';
import type { BodyClass } from '@cs/shared/vocabulary';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../../db/client';
import { carBrands, carModels } from '../../../db/schema';
import { requirePermission, type StaffActor } from '../../../platform/actors';
import type { PlatformDeps } from '../../../platform/deps';
import { AppError, invalidAt } from '../../../platform/errors';
import { isMissingReference, violatedUniqueConstraint } from '../../../platform/pg-errors';
import type { AuditService } from '../../audit';

/** Brands and their models, each with the body class that sets the price (docs/PLAN.md, 7.5). */

export interface BrandsServiceDeps extends PlatformDeps {
  audit: AuditService;
}

export interface BrandPatch {
  name?: string | undefined;
  sort?: number | undefined;
  isActive?: boolean | undefined;
}

export interface ModelPatch extends BrandPatch {
  bodyClass?: BodyClass | undefined;
}

export interface BrandsService {
  list(actor: StaffActor): Promise<CarBrand[]>;
  createBrand(actor: StaffActor, input: { name: string }, ip?: string): Promise<CarBrand>;
  updateBrand(actor: StaffActor, id: string, patch: BrandPatch, ip?: string): Promise<CarBrand>;
  createModel(
    actor: StaffActor,
    input: { brandId: string; name: string; bodyClass: BodyClass },
    ip?: string,
  ): Promise<CarModel>;
  updateModel(actor: StaffActor, id: string, patch: ModelPatch, ip?: string): Promise<CarModel>;
}

/** A name that is already taken is a conflict the owner can fix, not a server failure. */
function rethrow(error: unknown): never {
  const constraint = violatedUniqueConstraint(error);
  if (constraint === 'car_brands_name_unique' || constraint === 'car_models_brand_name_unique') {
    throw new AppError('name_taken');
  }
  throw error;
}

const toModel = (row: typeof carModels.$inferSelect): CarModel => ({
  id: row.id,
  brandId: row.brandId,
  name: row.name,
  bodyClass: row.bodyClass,
  sort: row.sort,
  isActive: row.isActive,
});

export function createBrandsService(deps: BrandsServiceDeps): BrandsService {
  const { db, audit, clock } = deps;

  async function brandViews(from: DbOrTx, only?: string): Promise<CarBrand[]> {
    const brands = await from
      .select()
      .from(carBrands)
      .where(only ? eq(carBrands.id, only) : undefined)
      .orderBy(asc(carBrands.sort), asc(carBrands.name), asc(carBrands.id));
    const models =
      brands.length === 0
        ? []
        : await from
            .select()
            .from(carModels)
            .where(
              inArray(
                carModels.brandId,
                brands.map((brand) => brand.id),
              ),
            )
            .orderBy(asc(carModels.sort), asc(carModels.name), asc(carModels.id));
    return brands.map((brand) => ({
      id: brand.id,
      name: brand.name,
      sort: brand.sort,
      isActive: brand.isActive,
      models: models.filter((model) => model.brandId === brand.id).map(toModel),
    }));
  }

  async function brandView(from: DbOrTx, id: string): Promise<CarBrand> {
    const [brand] = await brandViews(from, id);
    if (!brand) throw new AppError('not_found');
    return brand;
  }

  /** The brand without its models, for the audit log: what changed is the brand itself. */
  const brandAudit = ({ models: _models, ...brand }: CarBrand) => brand;

  async function modelView(from: DbOrTx, id: string): Promise<CarModel> {
    const [row] = await from.select().from(carModels).where(eq(carModels.id, id));
    if (!row) throw new AppError('not_found');
    return toModel(row);
  }

  return {
    async list(actor) {
      requirePermission(actor, 'settings.write');
      return brandViews(db);
    },

    async createBrand(actor, input, ip) {
      requirePermission(actor, 'settings.write');
      try {
        return await db.transaction(async (tx) => {
          const [last] = await tx
            .select({ sort: sql<number>`coalesce(max(${carBrands.sort}), 0)` })
            .from(carBrands);
          const [inserted] = await tx
            .insert(carBrands)
            .values({ name: input.name, sort: (last?.sort ?? 0) + 1 })
            .returning({ id: carBrands.id });
          if (!inserted) throw new Error('insert returned no row');
          const brand = await brandView(tx, inserted.id);
          await audit.record(tx, {
            actorId: actor.userId,
            action: 'brand.create',
            entity: 'brand',
            entityId: brand.id,
            after: brandAudit(brand),
            ip: ip ?? null,
          });
          return brand;
        });
      } catch (error) {
        rethrow(error);
      }
    },

    async updateBrand(actor, id, patch, ip) {
      requirePermission(actor, 'settings.write');
      try {
        return await db.transaction(async (tx) => {
          const [row] = await tx.select().from(carBrands).where(eq(carBrands.id, id)).for('update');
          if (!row) throw new AppError('not_found');
          const before = brandAudit(await brandView(tx, id));

          await tx
            .update(carBrands)
            .set({
              name: patch.name ?? row.name,
              sort: patch.sort ?? row.sort,
              isActive: patch.isActive ?? row.isActive,
              updatedAt: clock.now(),
            })
            .where(eq(carBrands.id, id));

          const brand = await brandView(tx, id);
          const after = brandAudit(brand);
          if (JSON.stringify(before) !== JSON.stringify(after)) {
            await audit.record(tx, {
              actorId: actor.userId,
              action: 'brand.update',
              entity: 'brand',
              entityId: id,
              before,
              after,
              ip: ip ?? null,
            });
          }
          return brand;
        });
      } catch (error) {
        rethrow(error);
      }
    },

    async createModel(actor, input, ip) {
      requirePermission(actor, 'settings.write');
      try {
        return await db.transaction(async (tx) => {
          const [last] = await tx
            .select({ sort: sql<number>`coalesce(max(${carModels.sort}), 0)` })
            .from(carModels)
            .where(eq(carModels.brandId, input.brandId));
          const [inserted] = await tx
            .insert(carModels)
            .values({
              brandId: input.brandId,
              name: input.name,
              bodyClass: input.bodyClass,
              sort: (last?.sort ?? 0) + 1,
            })
            .returning({ id: carModels.id });
          if (!inserted) throw new Error('insert returned no row');
          const model = await modelView(tx, inserted.id);
          await audit.record(tx, {
            actorId: actor.userId,
            action: 'model.create',
            entity: 'model',
            entityId: model.id,
            after: model,
            ip: ip ?? null,
          });
          return model;
        });
      } catch (error) {
        if (isMissingReference(error)) throw invalidAt('body.brandId', 'unknown brand');
        rethrow(error);
      }
    },

    async updateModel(actor, id, patch, ip) {
      requirePermission(actor, 'settings.write');
      try {
        return await db.transaction(async (tx) => {
          const [row] = await tx.select().from(carModels).where(eq(carModels.id, id)).for('update');
          if (!row) throw new AppError('not_found');
          const before = toModel(row);

          await tx
            .update(carModels)
            .set({
              name: patch.name ?? row.name,
              bodyClass: patch.bodyClass ?? row.bodyClass,
              sort: patch.sort ?? row.sort,
              isActive: patch.isActive ?? row.isActive,
              updatedAt: clock.now(),
            })
            .where(eq(carModels.id, id));

          const model = await modelView(tx, id);
          if (JSON.stringify(before) !== JSON.stringify(model)) {
            await audit.record(tx, {
              actorId: actor.userId,
              action: 'model.update',
              entity: 'model',
              entityId: id,
              before,
              after: model,
              ip: ip ?? null,
            });
          }
          return model;
        });
      } catch (error) {
        rethrow(error);
      }
    },
  };
}
