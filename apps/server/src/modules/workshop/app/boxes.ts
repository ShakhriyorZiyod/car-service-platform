import type { Box } from '@cs/shared';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../../db/client';
import { boxes, boxServiceTypes } from '../../../db/schema';
import { requirePermission, type StaffActor } from '../../../platform/actors';
import type { PlatformDeps } from '../../../platform/deps';
import { AppError, invalidAt } from '../../../platform/errors';
import { isMissingReference } from '../../../platform/pg-errors';
import type { AuditService } from '../../audit';

/** The boxes (work bays) and the kinds of work each can do (docs/PLAN.md, section 7.4). */

export interface BoxesServiceDeps extends PlatformDeps {
  audit: AuditService;
}

export interface NewBox {
  name: string;
  note?: string | null | undefined;
  serviceTypeIds: readonly string[];
}

export interface BoxPatch {
  name?: string | undefined;
  note?: string | null | undefined;
  serviceTypeIds?: readonly string[] | undefined;
  isActive?: boolean | undefined;
  sort?: number | undefined;
}

export interface BoxesService {
  list(actor: StaffActor): Promise<Box[]>;
  create(actor: StaffActor, input: NewBox, ip?: string): Promise<Box>;
  update(actor: StaffActor, id: string, patch: BoxPatch, ip?: string): Promise<Box>;
  /**
   * The boxes in service that can do every one of these kinds of work, in the owner's order.
   * No permission check: for other modules' use cases.
   */
  eligible(serviceTypeIds: readonly string[], db?: DbOrTx): Promise<{ id: string; name: string }[]>;
}

const unique = (ids: readonly string[]): string[] => [...new Set(ids)].sort();

export function createBoxesService(deps: BoxesServiceDeps): BoxesService {
  const { db, audit, clock } = deps;

  async function viewsOf(from: DbOrTx, only?: string): Promise<Box[]> {
    const rows = await from
      .select()
      .from(boxes)
      .where(only ? eq(boxes.id, only) : undefined)
      .orderBy(asc(boxes.sort), asc(boxes.name), asc(boxes.id));
    const links =
      rows.length === 0
        ? []
        : await from
            .select()
            .from(boxServiceTypes)
            .where(
              inArray(
                boxServiceTypes.boxId,
                rows.map((row) => row.id),
              ),
            );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      note: row.note,
      sort: row.sort,
      isActive: row.isActive,
      serviceTypeIds: unique(
        links.filter((link) => link.boxId === row.id).map((link) => link.serviceTypeId),
      ),
    }));
  }

  async function viewOf(from: DbOrTx, id: string): Promise<Box> {
    const [box] = await viewsOf(from, id);
    if (!box) throw new AppError('not_found');
    return box;
  }

  async function replaceServiceTypes(tx: DbOrTx, boxId: string, ids: readonly string[]) {
    await tx.delete(boxServiceTypes).where(eq(boxServiceTypes.boxId, boxId));
    if (ids.length > 0) {
      await tx
        .insert(boxServiceTypes)
        .values(ids.map((serviceTypeId) => ({ boxId, serviceTypeId })));
    }
  }

  /** An id that names no service type is the client's mistake, not a server failure. */
  function rethrow(error: unknown): never {
    if (isMissingReference(error)) throw invalidAt('body.serviceTypeIds', 'unknown service type');
    throw error;
  }

  return {
    async eligible(serviceTypeIds, from = db) {
      const needed = new Set(serviceTypeIds);
      const active = (await viewsOf(from)).filter((box) => box.isActive);
      return active
        .filter((box) => [...needed].every((id) => box.serviceTypeIds.includes(id)))
        .map((box) => ({ id: box.id, name: box.name }));
    },

    async list(actor) {
      requirePermission(actor, 'settings.write');
      return viewsOf(db);
    },

    async create(actor, input, ip) {
      requirePermission(actor, 'settings.write');
      try {
        return await db.transaction(async (tx) => {
          const [last] = await tx
            .select({ sort: sql<number>`coalesce(max(${boxes.sort}), 0)` })
            .from(boxes);
          const [inserted] = await tx
            .insert(boxes)
            .values({
              name: input.name,
              note: input.note ?? null,
              sort: (last?.sort ?? 0) + 1,
            })
            .returning({ id: boxes.id });
          if (!inserted) throw new Error('insert returned no row');
          await replaceServiceTypes(tx, inserted.id, unique(input.serviceTypeIds));

          const box = await viewOf(tx, inserted.id);
          await audit.record(tx, {
            actorId: actor.userId,
            action: 'box.create',
            entity: 'box',
            entityId: box.id,
            after: box,
            ip: ip ?? null,
          });
          return box;
        });
      } catch (error) {
        rethrow(error);
      }
    },

    async update(actor, id, patch, ip) {
      requirePermission(actor, 'settings.write');
      try {
        return await db.transaction(async (tx) => {
          const [row] = await tx.select().from(boxes).where(eq(boxes.id, id)).for('update');
          if (!row) throw new AppError('not_found');
          const before = await viewOf(tx, id);

          await tx
            .update(boxes)
            .set({
              name: patch.name ?? row.name,
              note: patch.note === undefined ? row.note : patch.note,
              isActive: patch.isActive ?? row.isActive,
              sort: patch.sort ?? row.sort,
              updatedAt: clock.now(),
            })
            .where(eq(boxes.id, id));
          if (patch.serviceTypeIds) {
            await replaceServiceTypes(tx, id, unique(patch.serviceTypeIds));
          }

          const after = await viewOf(tx, id);
          if (JSON.stringify(before) !== JSON.stringify(after)) {
            await audit.record(tx, {
              actorId: actor.userId,
              action: 'box.update',
              entity: 'box',
              entityId: id,
              before,
              after,
              ip: ip ?? null,
            });
          }
          return after;
        });
      } catch (error) {
        rethrow(error);
      }
    },
  };
}
