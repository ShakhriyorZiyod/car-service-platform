import type { Car, UnmappedCar } from '@cs/shared';
import { ACTIVE_ORDER_STATUSES, type BodyClass } from '@cs/shared/vocabulary';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { DbOrTx, Tx } from '../../../db/client';
import { carBrands, carModels, cars, orders, users } from '../../../db/schema';
import { localDateOf } from '../../../lib/time';
import {
  requirePermission,
  requireVerifiedPhone,
  type ClientActor,
  type StaffActor,
} from '../../../platform/actors';
import type { PlatformDeps } from '../../../platform/deps';
import { AppError } from '../../../platform/errors';
import { violatedUniqueConstraint } from '../../../platform/pg-errors';
import type { AuditService } from '../../audit';
import { carLabel, checkCar, type CarInput } from '../domain/car';

/** The client's garage (docs/PLAN.md, section 7.6). Every use case works on the caller's cars. */

export interface CarPatch {
  modelId?: string | null | undefined;
  customModelText?: string | null | undefined;
  bodyClass?: BodyClass | null | undefined;
  year?: number | undefined;
  plate?: string | undefined;
  color?: string | null | undefined;
}

export interface GarageService {
  list(actor: ClientActor): Promise<Car[]>;
  create(actor: ClientActor, input: CarInput): Promise<Car>;
  /** A car added by the staff for a client: no phone is needed, the admin knows the person. */
  createFor(clientId: string, input: CarInput): Promise<Car>;
  /** The client's cars, for the staff. */
  listFor(clientId: string): Promise<Car[]>;
  /** Erases the plates of an erased client, inside the caller's transaction (TZ 15.3). */
  anonymize(tx: Tx, clientId: string): Promise<void>;
  /** The cars added with "Other" that still wait for a real model. */
  unmapped(actor: StaffActor): Promise<UnmappedCar[]>;
  /** Ties such a car to a model; the body class follows the model unless the admin corrects it. */
  map(
    actor: StaffActor,
    id: string,
    input: { modelId: string; bodyClass?: BodyClass | undefined },
    ip?: string,
  ): Promise<Car>;
  update(actor: ClientActor, id: string, patch: CarPatch): Promise<Car>;
  /** Hides the car from the garage; refused while an order of it is in progress. */
  archive(actor: ClientActor, id: string): Promise<void>;
  /**
   * The client's own car that is still in the garage, with its label, for an order. Another
   * client's car, or an archived one, does not exist for them.
   */
  own(clientId: string, carId: string, from?: DbOrTx): Promise<{ car: Car; label: string }>;
}

export interface GarageDeps extends PlatformDeps {
  audit: AuditService;
}

export function createGarageService(deps: GarageDeps): GarageService {
  const { db, clock, audit } = deps;

  const select = (from: DbOrTx) =>
    from
      .select({
        id: cars.id,
        modelId: cars.modelId,
        brand: carBrands.name,
        modelName: carModels.name,
        customModelText: cars.customModelText,
        bodyClass: cars.bodyClass,
        year: cars.year,
        plate: cars.plate,
        color: cars.color,
      })
      .from(cars)
      .leftJoin(carModels, eq(carModels.id, cars.modelId))
      .leftJoin(carBrands, eq(carBrands.id, carModels.brandId));

  type Row = Awaited<ReturnType<ReturnType<typeof select>['limit']>>[number];
  const toCar = (row: Row): Car => ({
    id: row.id,
    modelId: row.modelId,
    brand: row.brand,
    model: row.modelName ?? row.customModelText ?? '',
    customModelText: row.customModelText,
    bodyClass: row.bodyClass,
    year: row.year,
    plate: row.plate,
    color: row.color,
  });

  async function find(from: DbOrTx, clientId: string, id: string): Promise<Car> {
    const [row] = await select(from)
      .where(and(eq(cars.id, id), eq(cars.clientId, clientId), isNull(cars.archivedAt)))
      .limit(1);
    // Somebody else's car is not found, not forbidden: its existence is not for them to know.
    if (!row) throw new AppError('not_found');
    return toCar(row);
  }

  /** The class comes from the model; "Other" keeps what the client picked. */
  async function bodyClassOf(from: DbOrTx, input: CarInput): Promise<BodyClass> {
    if (input.modelId === null) {
      if (input.bodyClass === null) throw new AppError('validation');
      return input.bodyClass;
    }
    const [model] = await from
      .select({ bodyClass: carModels.bodyClass, isActive: carModels.isActive })
      .from(carModels)
      .where(eq(carModels.id, input.modelId));
    if (!model?.isActive) {
      throw new AppError('validation', 'unknown model', { paths: ['body.modelId'] });
    }
    return model.bodyClass;
  }

  function validated(input: CarInput): string {
    const { plate, problems } = checkCar(input, Number(localDateOf(clock.now()).slice(0, 4)));
    if (problems.length > 0 || plate === null) {
      throw new AppError('validation', 'invalid car', {
        paths: problems.map(({ field }) => `body.${field}`),
      });
    }
    return plate;
  }

  function rethrow(error: unknown): never {
    if (violatedUniqueConstraint(error) === 'cars_client_plate_unique') {
      throw new AppError('plate_taken');
    }
    throw error;
  }

  return {
    async list(actor) {
      const rows = await select(db)
        .where(and(eq(cars.clientId, actor.userId), isNull(cars.archivedAt)))
        .orderBy(asc(cars.createdAt), asc(cars.id));
      return rows.map(toCar);
    },

    async createFor(clientId, input) {
      const plate = validated(input);
      const bodyClass = await bodyClassOf(db, input);
      try {
        const [inserted] = await db
          .insert(cars)
          .values({
            clientId,
            modelId: input.modelId,
            customModelText: input.modelId === null ? input.customModelText : null,
            bodyClass,
            year: input.year,
            plate,
            color: input.color,
          })
          .returning({ id: cars.id });
        if (!inserted) throw new Error('insert returned no row');
        return await find(db, clientId, inserted.id);
      } catch (error) {
        rethrow(error);
      }
    },

    async listFor(clientId) {
      const rows = await select(db)
        .where(and(eq(cars.clientId, clientId), isNull(cars.archivedAt)))
        .orderBy(asc(cars.createdAt), asc(cars.id));
      return rows.map(toCar);
    },

    async anonymize(tx, clientId) {
      const rows = await tx.select({ id: cars.id }).from(cars).where(eq(cars.clientId, clientId));
      for (const row of rows) {
        // Unique per client while in the garage, so each gets its own placeholder.
        await tx
          .update(cars)
          .set({
            plate: `ANON-${row.id.slice(-8).toUpperCase()}`,
            color: null,
            customModelText: null,
            archivedAt: clock.now(),
          })
          .where(eq(cars.id, row.id));
      }
    },

    async create(actor, input) {
      requireVerifiedPhone(actor);
      const plate = validated(input);
      const bodyClass = await bodyClassOf(db, input);
      try {
        const [inserted] = await db
          .insert(cars)
          .values({
            clientId: actor.userId,
            modelId: input.modelId,
            customModelText: input.modelId === null ? input.customModelText : null,
            bodyClass,
            year: input.year,
            plate,
            color: input.color,
          })
          .returning({ id: cars.id });
        if (!inserted) throw new Error('insert returned no row');
        return await find(db, actor.userId, inserted.id);
      } catch (error) {
        rethrow(error);
      }
    },

    async unmapped(actor) {
      requirePermission(actor, 'clients.read');
      return db
        .select({
          id: cars.id,
          clientId: cars.clientId,
          clientName: users.fullName,
          customModelText: cars.customModelText,
          bodyClass: cars.bodyClass,
          year: cars.year,
          plate: cars.plate,
          color: cars.color,
        })
        .from(cars)
        .innerJoin(users, eq(users.id, cars.clientId))
        .where(and(isNull(cars.modelId), isNull(cars.archivedAt)))
        .orderBy(asc(cars.createdAt), asc(cars.id));
    },

    async map(actor, id, input, ip) {
      requirePermission(actor, 'clients.write');
      const [model] = await db
        .select({ bodyClass: carModels.bodyClass, isActive: carModels.isActive })
        .from(carModels)
        .where(eq(carModels.id, input.modelId));
      if (!model?.isActive) {
        throw new AppError('validation', 'unknown model', { paths: ['body.modelId'] });
      }
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select({ clientId: cars.clientId, bodyClass: cars.bodyClass })
          .from(cars)
          .where(and(eq(cars.id, id), isNull(cars.modelId), isNull(cars.archivedAt)))
          .for('update');
        // Only a car waiting for its model is mapped here; a mapped one is the client's to change.
        if (!current) throw new AppError('not_found');
        const bodyClass = input.bodyClass ?? model.bodyClass;
        await tx
          .update(cars)
          .set({ modelId: input.modelId, customModelText: null, bodyClass, updatedAt: clock.now() })
          .where(eq(cars.id, id));
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'car.map',
          entity: 'car',
          entityId: id,
          before: { modelId: null, bodyClass: current.bodyClass },
          after: { modelId: input.modelId, bodyClass },
          ip: ip ?? null,
        });
        return find(tx, current.clientId, id);
      });
    },

    async update(actor, id, patch) {
      requireVerifiedPhone(actor);
      const current = await find(db, actor.userId, id);
      // A change of model replaces the old one wholly: the model or the words, never both.
      const changesModel = patch.modelId !== undefined || patch.customModelText !== undefined;
      const next: CarInput = {
        modelId: changesModel ? (patch.modelId ?? null) : current.modelId,
        customModelText: changesModel ? (patch.customModelText ?? null) : current.customModelText,
        bodyClass: patch.bodyClass === undefined ? current.bodyClass : patch.bodyClass,
        year: patch.year ?? current.year,
        plate: patch.plate ?? current.plate,
        color: patch.color === undefined ? current.color : patch.color,
      };
      const plate = validated(next);
      const bodyClass = await bodyClassOf(db, next);
      try {
        await db
          .update(cars)
          .set({
            modelId: next.modelId,
            customModelText: next.modelId === null ? next.customModelText : null,
            bodyClass,
            year: next.year,
            plate,
            color: next.color,
            updatedAt: clock.now(),
          })
          .where(and(eq(cars.id, id), eq(cars.clientId, actor.userId)));
      } catch (error) {
        rethrow(error);
      }
      return find(db, actor.userId, id);
    },

    async archive(actor, id) {
      await find(db, actor.userId, id);
      await db.transaction(async (tx) => {
        // Locked, so an order made this instant is seen: no car with work in progress disappears.
        await tx.select({ id: cars.id }).from(cars).where(eq(cars.id, id)).for('update');
        const [active] = await tx
          .select({ id: orders.id })
          .from(orders)
          .where(and(eq(orders.carId, id), inArray(orders.status, [...ACTIVE_ORDER_STATUSES])))
          .limit(1);
        if (active) throw new AppError('car_has_active_orders');
        await tx.update(cars).set({ archivedAt: clock.now() }).where(eq(cars.id, id));
      });
    },

    async own(clientId, carId, from = db) {
      const car = await find(from, clientId, carId);
      return { car, label: carLabel(car) };
    },
  };
}
