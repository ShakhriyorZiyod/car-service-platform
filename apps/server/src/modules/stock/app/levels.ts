import type { LowStockItem, StockMovement, StockRow } from '@cs/shared';
import type { StockFilter } from '@cs/shared/vocabulary';
import { and, asc, desc, eq, ilike, lt, or } from 'drizzle-orm';
import type { DbOrTx } from '../../../db/client';
import {
  productCategories,
  products,
  stockDocuments,
  stockLevels,
  stockMovements,
  users,
} from '../../../db/schema';
import { localDateOf, presentInstant } from '../../../lib/time';
import { requirePermission, type StaffActor } from '../../../platform/actors';
import type { PlatformDeps } from '../../../platform/deps';
import type { Outbox } from '../../../platform/outbox';
import type { ScheduledTask, StaffDirectory } from '../../../platform/ports';
import { workIntervals, type WorkshopService } from '../../workshop';
import { isLow, lineSum, roundQty, stockDigestKey, stockState } from '../domain/stock';

/**
 * What there is in the warehouse (design A5): the stock of every product, the journal of its
 * movements, and what has fallen to its minimum (docs/PLAN.md, sections 9.6 and 12).
 */

export interface LevelsServiceDeps extends PlatformDeps {
  workshop: Pick<WorkshopService, 'hours'>;
  outbox: Outbox;
  staff: StaffDirectory;
}

export interface StockQuery {
  q?: string | undefined;
  filter: StockFilter;
  categoryId?: string | undefined;
}

export interface MovementQuery {
  productId?: string | undefined;
  cursor?: string | undefined;
  limit: number;
}

export interface LevelsService {
  list(actor: StaffActor, query: StockQuery): Promise<StockRow[]>;
  movements(
    actor: StaffActor,
    query: MovementQuery,
  ): Promise<{ items: StockMovement[]; nextCursor: string | null }>;
  low(actor: StaffActor): Promise<LowStockItem[]>;
  /** The "Bugun" block: null for who may not see the warehouse. */
  lowFor(actor: StaffActor): Promise<LowStockItem[] | null>;
  /** Once a day, in working hours, the list goes to the admins and the owner. */
  tasks: ScheduledTask[];
}

/** The daily message names this many; the rest are counted. */
const DIGEST_ITEMS = 15;

/** `%` and `_` typed by a person are letters, not patterns. */
const likeTerm = (text: string) => `%${text.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;

export function createLevelsService(deps: LevelsServiceDeps): LevelsService {
  const { db, workshop, outbox, staff } = deps;

  async function lowItems(from: DbOrTx): Promise<LowStockItem[]> {
    const rows = await from
      .select({
        productId: products.id,
        nameUz: products.nameUz,
        nameRu: products.nameRu,
        unit: products.unit,
        minQty: products.minQty,
        onHand: stockLevels.onHand,
        reserved: stockLevels.reserved,
      })
      .from(products)
      .innerJoin(stockLevels, eq(stockLevels.productId, products.id))
      .where(eq(products.isActive, true))
      .orderBy(asc(products.nameUz), asc(products.id));
    return rows
      .filter((row) => isLow(row, row.minQty))
      .map((row) => ({
        productId: row.productId,
        nameUz: row.nameUz,
        nameRu: row.nameRu,
        unit: row.unit,
        free: roundQty(row.onHand - row.reserved),
        minQty: row.minQty,
      }));
  }

  const digest: ScheduledTask = {
    name: 'stock-low-digest',
    async run(now) {
      // In working hours only, so it greets the morning rather than the night.
      const calendar = await workshop.hours.calendar();
      const open = workIntervals(calendar, localDateOf(now)).some(
        (interval) => now >= interval.start && now < interval.end,
      );
      if (!open) return;
      const items = await lowItems(db);
      if (items.length === 0) return;
      const key = stockDigestKey(localDateOf(now));
      await db.transaction(async (tx) => {
        for (const to of await staff.recipients(tx, ['admin', 'owner'])) {
          await outbox.enqueue(tx, {
            to,
            notification: {
              type: 'staff.stock_low',
              items: items.slice(0, DIGEST_ITEMS).map((item) => ({
                nameUz: item.nameUz,
                nameRu: item.nameRu,
                unit: item.unit,
                free: item.free,
                minQty: item.minQty,
              })),
              more: Math.max(0, items.length - DIGEST_ITEMS),
            },
            dedupeKey: `${key}:${to.userId}`,
          });
        }
      });
    },
  };

  const service: LevelsService = {
    async list(actor, query) {
      requirePermission(actor, 'stock.read');
      const term = query.q ? likeTerm(query.q) : null;
      const rows = await db
        .select({
          product: products,
          level: stockLevels,
          categoryNameUz: productCategories.nameUz,
          categoryNameRu: productCategories.nameRu,
        })
        .from(products)
        .innerJoin(stockLevels, eq(stockLevels.productId, products.id))
        .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
        .where(
          and(
            term
              ? or(
                  ilike(products.nameUz, term),
                  ilike(products.nameRu, term),
                  ilike(products.sku, term),
                  ilike(products.barcode, term),
                )
              : undefined,
            query.categoryId
              ? or(
                  eq(products.categoryId, query.categoryId),
                  eq(productCategories.parentId, query.categoryId),
                )
              : undefined,
            query.filter === 'for_sale' ? eq(products.isForSale, true) : undefined,
            query.filter === 'consumable' ? eq(products.isConsumable, true) : undefined,
          ),
        )
        .orderBy(asc(products.nameUz), asc(products.id));
      const seesCosts = actor.permissions.has('costs.read');
      return rows
        .filter(({ product, level }) => query.filter !== 'low' || isLow(level, product.minQty))
        .map(({ product, level, categoryNameUz, categoryNameRu }) => ({
          productId: product.id,
          sku: product.sku,
          nameUz: product.nameUz,
          nameRu: product.nameRu,
          categoryNameUz,
          categoryNameRu,
          unit: product.unit,
          isForSale: product.isForSale,
          isConsumable: product.isConsumable,
          minQty: product.minQty,
          isActive: product.isActive,
          stock: {
            onHand: level.onHand,
            reserved: level.reserved,
            free: roundQty(level.onHand - level.reserved),
            state: stockState(level, product.minQty),
          },
          costs: seesCosts
            ? { avgCost: product.avgCost, value: lineSum(level.onHand, product.avgCost) }
            : null,
        }));
    },

    async movements(actor, query) {
      requirePermission(actor, 'stock.read');
      const rows = await db
        .select({
          movement: stockMovements,
          nameUz: products.nameUz,
          nameRu: products.nameRu,
          unit: products.unit,
          documentNumber: stockDocuments.number,
          documentKind: stockDocuments.kind,
          actorName: users.fullName,
        })
        .from(stockMovements)
        .innerJoin(products, eq(products.id, stockMovements.productId))
        .innerJoin(stockDocuments, eq(stockDocuments.id, stockMovements.documentId))
        .leftJoin(users, eq(users.id, stockMovements.actorId))
        .where(
          and(
            query.productId ? eq(stockMovements.productId, query.productId) : undefined,
            // UUID v7 ids grow with time, so the id is also the order.
            query.cursor ? lt(stockMovements.id, query.cursor) : undefined,
          ),
        )
        .orderBy(desc(stockMovements.id))
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit);
      const seesCosts = actor.permissions.has('costs.read');
      return {
        items: page.map((row) => ({
          id: row.movement.id,
          at: presentInstant(row.movement.at),
          productId: row.movement.productId,
          nameUz: row.nameUz,
          nameRu: row.nameRu,
          unit: row.unit,
          delta: row.movement.delta,
          unitCost: seesCosts ? row.movement.unitCost : null,
          document: {
            id: row.movement.documentId,
            number: row.documentNumber,
            kind: row.documentKind,
          },
          actorName: row.actorName,
        })),
        nextCursor: rows.length > query.limit ? (page.at(-1)?.movement.id ?? null) : null,
      };
    },

    async low(actor) {
      requirePermission(actor, 'stock.read');
      return lowItems(db);
    },

    async lowFor(actor) {
      if (!actor.permissions.has('stock.read')) return null;
      return lowItems(db);
    },

    tasks: [digest],
  };
  return service;
}
