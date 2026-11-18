import type { PriceMatrix, Service, ServiceType } from '@cs/shared';
import { BODY_CLASSES, type ServiceGroup } from '@cs/shared/vocabulary';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../../db/client';
import { servicePrices, serviceExcludes, services, serviceTypes } from '../../../db/schema';
import { requirePermission, type StaffActor } from '../../../platform/actors';
import type { PlatformDeps } from '../../../platform/deps';
import { AppError, invalidAt } from '../../../platform/errors';
import { violatedUniqueConstraint } from '../../../platform/pg-errors';
import type { AuditService } from '../../audit';
import { excludeProblems, type ZoneRef } from '../domain/excludes';
import { changedCells, priceCellProblems, type PriceCell } from '../domain/price-matrix';

/**
 * Kinds of work, their zones and the price matrix (docs/PLAN.md, section 7.5). The owner edits
 * them, and every change is audited.
 */

export interface ServicesServiceDeps extends PlatformDeps {
  audit: AuditService;
}

export interface NewServiceType {
  code: string;
  nameUz: string;
  nameRu: string;
  icon: string;
}

export interface ServiceTypePatch {
  nameUz?: string | undefined;
  nameRu?: string | undefined;
  icon?: string | undefined;
  sort?: number | undefined;
  isActive?: boolean | undefined;
}

export interface NewService {
  serviceTypeId: string;
  nameUz: string;
  nameRu: string;
  group: ServiceGroup;
  isCustom?: boolean | undefined;
}

export interface ServicePatch {
  nameUz?: string | undefined;
  nameRu?: string | undefined;
  group?: ServiceGroup | undefined;
  sort?: number | undefined;
  isActive?: boolean | undefined;
  /** Replaces the zones this one removes from an order. */
  excludes?: readonly string[] | undefined;
}

export interface ServicesService {
  listTypes(actor: StaffActor): Promise<ServiceType[]>;
  createType(actor: StaffActor, input: NewServiceType, ip?: string): Promise<ServiceType>;
  updateType(
    actor: StaffActor,
    id: string,
    patch: ServiceTypePatch,
    ip?: string,
  ): Promise<ServiceType>;
  prices(actor: StaffActor, serviceTypeId: string): Promise<PriceMatrix>;
  /** Replaces every cell of the kind of work at once; a cell that is missing is deleted. */
  updatePrices(
    actor: StaffActor,
    serviceTypeId: string,
    cells: readonly PriceCell[],
    ip?: string,
  ): Promise<PriceMatrix>;
  createService(actor: StaffActor, input: NewService, ip?: string): Promise<Service>;
  updateService(actor: StaffActor, id: string, patch: ServicePatch, ip?: string): Promise<Service>;
}

const toType = (row: typeof serviceTypes.$inferSelect): ServiceType => ({
  id: row.id,
  code: row.code,
  nameUz: row.nameUz,
  nameRu: row.nameRu,
  icon: row.icon,
  sort: row.sort,
  isActive: row.isActive,
});

const classOrder = (cell: { bodyClass: string }): number =>
  (BODY_CLASSES as readonly string[]).indexOf(cell.bodyClass);

/** The zone without its cells: prices have their own entries in the audit log. */
const zoneAudit = ({ cells: _cells, ...zone }: Service) => zone;

export function createServicesService(deps: ServicesServiceDeps): ServicesService {
  const { db, audit, clock } = deps;

  async function typeView(from: DbOrTx, id: string): Promise<ServiceType> {
    const [row] = await from.select().from(serviceTypes).where(eq(serviceTypes.id, id));
    if (!row) throw new AppError('not_found');
    return toType(row);
  }

  /** The zones of kinds of work with their cells and exclusions. */
  async function zoneViews(
    from: DbOrTx,
    where: { serviceTypeId?: string; id?: string },
  ): Promise<Service[]> {
    const rows = await from
      .select()
      .from(services)
      .where(
        where.id
          ? eq(services.id, where.id)
          : where.serviceTypeId
            ? eq(services.serviceTypeId, where.serviceTypeId)
            : undefined,
      )
      .orderBy(asc(services.sort), asc(services.nameUz), asc(services.id));
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    // One query after another: a transaction has a single connection.
    const prices = await from
      .select()
      .from(servicePrices)
      .where(inArray(servicePrices.serviceId, ids));
    const excludes = await from
      .select()
      .from(serviceExcludes)
      .where(inArray(serviceExcludes.serviceId, ids));
    return rows.map((row) => ({
      id: row.id,
      serviceTypeId: row.serviceTypeId,
      nameUz: row.nameUz,
      nameRu: row.nameRu,
      group: row.group,
      isCustom: row.isCustom,
      sort: row.sort,
      isActive: row.isActive,
      excludes: excludes
        .filter((link) => link.serviceId === row.id)
        .map((link) => link.excludedServiceId)
        .sort(),
      cells: prices
        .filter((cell) => cell.serviceId === row.id)
        .map((cell) => ({
          bodyClass: cell.bodyClass,
          price: cell.price,
          durationMin: cell.durationMin,
        }))
        .sort((a, b) => classOrder(a) - classOrder(b)),
    }));
  }

  async function zoneView(from: DbOrTx, id: string): Promise<Service> {
    const [zone] = await zoneViews(from, { id });
    if (!zone) throw new AppError('not_found');
    return zone;
  }

  async function matrixOf(from: DbOrTx, serviceTypeId: string): Promise<PriceMatrix> {
    return {
      serviceType: await typeView(from, serviceTypeId),
      services: await zoneViews(from, { serviceTypeId }),
    };
  }

  const flatCells = (zones: readonly Service[]): PriceCell[] =>
    zones.flatMap((zone) => zone.cells.map((cell) => ({ serviceId: zone.id, ...cell })));

  function rethrowTypeConflict(error: unknown): never {
    if (violatedUniqueConstraint(error) === 'service_types_code_unique') {
      throw new AppError('name_taken');
    }
    throw error;
  }

  return {
    async listTypes(actor) {
      requirePermission(actor, 'settings.write');
      const rows = await db
        .select()
        .from(serviceTypes)
        .orderBy(asc(serviceTypes.sort), asc(serviceTypes.nameUz), asc(serviceTypes.id));
      return rows.map(toType);
    },

    async createType(actor, input, ip) {
      requirePermission(actor, 'settings.write');
      try {
        return await db.transaction(async (tx) => {
          const [last] = await tx
            .select({ sort: sql<number>`coalesce(max(${serviceTypes.sort}), 0)` })
            .from(serviceTypes);
          const [inserted] = await tx
            .insert(serviceTypes)
            .values({ ...input, sort: (last?.sort ?? 0) + 1 })
            .returning({ id: serviceTypes.id });
          if (!inserted) throw new Error('insert returned no row');
          const type = await typeView(tx, inserted.id);
          await audit.record(tx, {
            actorId: actor.userId,
            action: 'service_type.create',
            entity: 'service_type',
            entityId: type.id,
            after: type,
            ip: ip ?? null,
          });
          return type;
        });
      } catch (error) {
        rethrowTypeConflict(error);
      }
    },

    async updateType(actor, id, patch, ip) {
      requirePermission(actor, 'settings.write');
      return db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(serviceTypes)
          .where(eq(serviceTypes.id, id))
          .for('update');
        if (!row) throw new AppError('not_found');
        const before = toType(row);
        await tx
          .update(serviceTypes)
          .set({
            nameUz: patch.nameUz ?? row.nameUz,
            nameRu: patch.nameRu ?? row.nameRu,
            icon: patch.icon ?? row.icon,
            sort: patch.sort ?? row.sort,
            isActive: patch.isActive ?? row.isActive,
            updatedAt: clock.now(),
          })
          .where(eq(serviceTypes.id, id));
        const after = await typeView(tx, id);
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          await audit.record(tx, {
            actorId: actor.userId,
            action: 'service_type.update',
            entity: 'service_type',
            entityId: id,
            before,
            after,
            ip: ip ?? null,
          });
        }
        return after;
      });
    },

    async prices(actor, serviceTypeId) {
      requirePermission(actor, 'settings.write');
      return matrixOf(db, serviceTypeId);
    },

    async updatePrices(actor, serviceTypeId, cells, ip) {
      requirePermission(actor, 'settings.write');
      return db.transaction(async (tx) => {
        // The kind of work is the lock: two matrices of it saved at once take turns.
        const [type] = await tx
          .select({ id: serviceTypes.id, code: serviceTypes.code })
          .from(serviceTypes)
          .where(eq(serviceTypes.id, serviceTypeId))
          .for('update');
        if (!type) throw new AppError('not_found');
        const zones = await zoneViews(tx, { serviceTypeId });

        const zoneIds = new Set(zones.map((zone) => zone.id));
        const unknown = cells.findIndex((cell) => !zoneIds.has(cell.serviceId));
        if (unknown >= 0)
          throw invalidAt(`body.cells.${unknown}.serviceId`, 'not a zone of this type');
        const custom = new Set(zones.filter((zone) => zone.isCustom).map((zone) => zone.id));
        const issues = priceCellProblems(cells, custom);
        if (issues.length > 0) {
          throw new AppError('validation', 'invalid price matrix', {
            paths: issues.map(({ index, field }) => `body.cells.${index}.${field}`),
          });
        }

        const before = flatCells(zones);
        const changes = changedCells(before, cells);
        if (changes.before.length === 0 && changes.after.length === 0) {
          return matrixOf(tx, serviceTypeId);
        }

        if (zoneIds.size > 0) {
          await tx.delete(servicePrices).where(inArray(servicePrices.serviceId, [...zoneIds]));
        }
        if (cells.length > 0) {
          await tx.insert(servicePrices).values(
            cells.map(({ serviceId, bodyClass, price, durationMin }) => ({
              serviceId,
              bodyClass,
              price,
              durationMin,
            })),
          );
        }

        // The log names the zone, so it can be read without looking ids up.
        const nameOf = new Map(zones.map((zone) => [zone.id, zone.nameUz]));
        const named = (list: readonly PriceCell[]) =>
          list.map(({ serviceId, bodyClass, price, durationMin }) => ({
            zone: nameOf.get(serviceId) ?? serviceId,
            serviceId,
            bodyClass,
            price,
            durationMin,
          }));
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'prices.update',
          entity: 'service_type',
          entityId: serviceTypeId,
          before: { code: type.code, cells: named(changes.before) },
          after: { code: type.code, cells: named(changes.after) },
          ip: ip ?? null,
        });
        return matrixOf(tx, serviceTypeId);
      });
    },

    async createService(actor, input, ip) {
      requirePermission(actor, 'settings.write');
      return db.transaction(async (tx) => {
        const [type] = await tx
          .select({ id: serviceTypes.id })
          .from(serviceTypes)
          .where(eq(serviceTypes.id, input.serviceTypeId))
          .for('update');
        if (!type) throw invalidAt('body.serviceTypeId', 'unknown service type');
        const [last] = await tx
          .select({ sort: sql<number>`coalesce(max(${services.sort}), 0)` })
          .from(services)
          .where(eq(services.serviceTypeId, input.serviceTypeId));
        const [inserted] = await tx
          .insert(services)
          .values({
            serviceTypeId: input.serviceTypeId,
            nameUz: input.nameUz,
            nameRu: input.nameRu,
            group: input.group,
            isCustom: input.isCustom ?? false,
            sort: (last?.sort ?? 0) + 1,
          })
          .returning({ id: services.id });
        if (!inserted) throw new Error('insert returned no row');
        const zone = await zoneView(tx, inserted.id);
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'service.create',
          entity: 'service',
          entityId: zone.id,
          after: zone,
          ip: ip ?? null,
        });
        return zone;
      });
    },

    async updateService(actor, id, patch, ip) {
      requirePermission(actor, 'settings.write');
      return db.transaction(async (tx) => {
        const [row] = await tx.select().from(services).where(eq(services.id, id)).for('update');
        if (!row) throw new AppError('not_found');
        const before = await zoneView(tx, id);

        if (patch.excludes) {
          const wanted = [...new Set(patch.excludes)];
          const found =
            wanted.length === 0
              ? []
              : await tx
                  .select({ id: services.id, serviceTypeId: services.serviceTypeId })
                  .from(services)
                  .where(inArray(services.id, wanted));
          const known = new Map<string, ZoneRef>(found.map((zone) => [zone.id, zone]));
          const issues = excludeProblems({ id, serviceTypeId: row.serviceTypeId }, wanted, known);
          if (issues.length > 0) throw invalidAt('body.excludes', issues[0]?.problem);

          await tx.delete(serviceExcludes).where(eq(serviceExcludes.serviceId, id));
          if (wanted.length > 0) {
            await tx
              .insert(serviceExcludes)
              .values(wanted.map((excludedServiceId) => ({ serviceId: id, excludedServiceId })));
          }
        }

        await tx
          .update(services)
          .set({
            nameUz: patch.nameUz ?? row.nameUz,
            nameRu: patch.nameRu ?? row.nameRu,
            group: patch.group ?? row.group,
            sort: patch.sort ?? row.sort,
            isActive: patch.isActive ?? row.isActive,
            updatedAt: clock.now(),
          })
          .where(eq(services.id, id));

        const after = await zoneView(tx, id);
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          await audit.record(tx, {
            actorId: actor.userId,
            action: 'service.update',
            entity: 'service',
            entityId: id,
            // Prices have their own entry in the log; here only what the zone itself is.
            before: zoneAudit(before),
            after: zoneAudit(after),
            ip: ip ?? null,
          });
        }
        return after;
      });
    },
  };
}
