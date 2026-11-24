import type { ShopProduct, ShopProductCard } from '@cs/shared';
import type { ProductAvailability, ShopSort } from '@cs/shared/vocabulary';
import { and, asc, eq, gte, ilike, inArray, or, sql } from 'drizzle-orm';
import type { DbOrTx, Tx } from '../../../db/client';
import {
  media,
  productCategories,
  products,
  stockDocuments,
  stockLevels,
  stockMovements,
} from '../../../db/schema';
import type { PlatformDeps } from '../../../platform/deps';
import { AppError } from '../../../platform/errors';
import type { MediaService } from '../../media';
import { availabilityOf, maxCartQty, roundQty } from '../domain/stock';

/**
 * What the shop asks of the warehouse (docs/PLAN.md, sections 9.5 and 9.6): the catalog a client
 * sees (never the exact stock), the reserve of an order, and the sale when it is handed over.
 * The writing methods run inside the shop's transaction.
 */

export interface StockLine {
  productId: string;
  qty: number;
}

/** What an order needs to know of a product to price it and check it can be sold. */
export interface SaleFacts {
  productId: string;
  nameUz: string;
  nameRu: string;
  pack: string | null;
  sellPrice: number | null;
  /** On sale: active, for sale, in an active category. */
  onSale: boolean;
  free: number;
  availability: ProductAvailability;
  maxQty: number;
}

export interface CatalogQuery {
  categoryId?: string | undefined;
  q?: string | undefined;
  inStock?: boolean | undefined;
  sort: ShopSort;
}

export interface ShopStockService {
  /** The categories that have goods on sale, parents included (the Mini App's chips). */
  categories(): Promise<{ id: string; parentId: string | null; nameUz: string; nameRu: string }[]>;
  catalog(query: CatalogQuery): Promise<ShopProduct[]>;
  card(productId: string): Promise<ShopProductCard>;
  facts(from: DbOrTx, productIds: readonly string[]): Promise<Map<string, SaleFacts>>;
  /** Each product's cover photo, a signed link (outside a transaction: the cart's quote). */
  covers(productIds: readonly string[]): Promise<Map<string, string>>;
  /** All or nothing: one line short and nothing is reserved (`out_of_stock`, its products named). */
  reserve(tx: Tx, lines: readonly StockLine[]): Promise<void>;
  release(tx: Tx, lines: readonly StockLine[]): Promise<void>;
  /**
   * The goods leave the warehouse: a posted sale document. From the reserve for an order that held
   * one; from the free stock for a sale at the counter, which may come up short.
   */
  sell(
    tx: Tx,
    sale: {
      actorId: string;
      shopOrderId: string;
      lines: readonly StockLine[];
      fromReserve: boolean;
      at: Date;
    },
  ): Promise<{ documentNumber: number }>;
}

const DAY_MS = 86_400_000;
/** "Popular" counts the sales of the last 30 days. */
const POPULAR_DAYS = 30;

const likeTerm = (text: string) => `%${text.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;

/** Lines in one order of products, so that two transactions lock them alike and never deadlock. */
const inProductOrder = (lines: readonly StockLine[]) =>
  [...lines].sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0));

export function createShopStockService(
  deps: PlatformDeps & { media: MediaService },
): ShopStockService {
  const { db, clock, media: photos } = deps;

  /** Products on sale with their category and stock. */
  const onSaleRows = (from: DbOrTx) =>
    from
      .select({ product: products, level: stockLevels, categoryActive: productCategories.isActive })
      .from(products)
      .innerJoin(stockLevels, eq(stockLevels.productId, products.id))
      .innerJoin(productCategories, eq(productCategories.id, products.categoryId));

  async function coversOf(ids: readonly string[]): Promise<Map<string, string[]>> {
    if (ids.length === 0) return new Map();
    const rows = await db
      .select({ id: media.id, productId: media.productId })
      .from(media)
      .where(inArray(media.productId, [...ids]))
      .orderBy(asc(media.createdAt), asc(media.id));
    const byProduct = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.productId) continue;
      byProduct.set(row.productId, [...(byProduct.get(row.productId) ?? []), row.id]);
    }
    return byProduct;
  }

  const view = (
    row: { product: typeof products.$inferSelect; level: typeof stockLevels.$inferSelect },
    photoIds: readonly string[],
  ): ShopProduct => {
    const free = roundQty(row.level.onHand - row.level.reserved);
    return {
      id: row.product.id,
      categoryId: row.product.categoryId,
      sku: row.product.sku,
      nameUz: row.product.nameUz,
      nameRu: row.product.nameRu,
      pack: row.product.pack,
      price: row.product.sellPrice ?? 0,
      availability: availabilityOf(free, row.product.minQty),
      maxQty: maxCartQty(free),
      photo: photoIds[0] ? photos.link(photoIds[0]) : null,
    };
  };

  return {
    async categories() {
      const used = await db
        .selectDistinct({ categoryId: products.categoryId })
        .from(products)
        .where(and(eq(products.isActive, true), eq(products.isForSale, true)));
      const all = await db
        .select()
        .from(productCategories)
        .where(eq(productCategories.isActive, true))
        .orderBy(asc(productCategories.sort), asc(productCategories.nameUz));
      const usedIds = new Set(used.map((row) => row.categoryId));
      const parents = new Set(
        all.filter((row) => usedIds.has(row.id) && row.parentId).map((row) => row.parentId),
      );
      return all
        .filter((row) => usedIds.has(row.id) || parents.has(row.id))
        .map((row) => ({
          id: row.id,
          parentId: row.parentId,
          nameUz: row.nameUz,
          nameRu: row.nameRu,
        }));
    },

    async catalog(query) {
      const term = query.q ? likeTerm(query.q) : null;
      const rows = await onSaleRows(db).where(
        and(
          eq(products.isActive, true),
          eq(products.isForSale, true),
          eq(productCategories.isActive, true),
          query.categoryId
            ? or(
                eq(products.categoryId, query.categoryId),
                eq(productCategories.parentId, query.categoryId),
              )
            : undefined,
          term
            ? or(
                ilike(products.nameUz, term),
                ilike(products.nameRu, term),
                ilike(products.sku, term),
              )
            : undefined,
        ),
      );
      const covers = await coversOf(rows.map((row) => row.product.id));
      let items = rows.map((row) => view(row, covers.get(row.product.id) ?? []));
      if (query.inStock) items = items.filter((item) => item.availability !== 'out');

      if (query.sort === 'popular') {
        const since = new Date(clock.now().getTime() - POPULAR_DAYS * DAY_MS);
        const sold = await db
          .select({
            productId: stockMovements.productId,
            qty: sql<string>`sum(-${stockMovements.delta})`,
          })
          .from(stockMovements)
          .innerJoin(stockDocuments, eq(stockDocuments.id, stockMovements.documentId))
          .where(and(eq(stockDocuments.kind, 'sale'), gte(stockMovements.at, since)))
          .groupBy(stockMovements.productId);
        const soldOf = new Map(sold.map((row) => [row.productId, Number(row.qty)]));
        // The best sellers first; what is out of stock goes last however well it sold.
        return items.sort(
          (a, b) =>
            Number(a.availability === 'out') - Number(b.availability === 'out') ||
            (soldOf.get(b.id) ?? 0) - (soldOf.get(a.id) ?? 0) ||
            a.nameUz.localeCompare(b.nameUz),
        );
      }
      const direction = query.sort === 'price_asc' ? 1 : -1;
      return items.sort(
        (a, b) => direction * (a.price - b.price) || a.nameUz.localeCompare(b.nameUz),
      );
    },

    async card(productId) {
      const [row] = await onSaleRows(db).where(
        and(
          eq(products.id, productId),
          eq(products.isActive, true),
          eq(products.isForSale, true),
          eq(productCategories.isActive, true),
        ),
      );
      // A product that is not on sale does not exist for a client.
      if (!row) throw new AppError('not_found');
      const photoIds = (await coversOf([productId])).get(productId) ?? [];
      return {
        ...view(row, photoIds),
        photos: photoIds.map((id) => photos.link(id)),
        descriptionUz: row.product.descriptionUz,
        descriptionRu: row.product.descriptionRu,
        brand: row.product.brand,
      };
    },

    async facts(from, productIds) {
      if (productIds.length === 0) return new Map();
      const rows = await onSaleRows(from).where(inArray(products.id, [...productIds]));
      return new Map(
        rows.map(({ product, level, categoryActive }) => {
          const free = roundQty(level.onHand - level.reserved);
          return [
            product.id,
            {
              productId: product.id,
              nameUz: product.nameUz,
              nameRu: product.nameRu,
              pack: product.pack,
              sellPrice: product.sellPrice,
              onSale: product.isActive && product.isForSale && categoryActive,
              free,
              availability: availabilityOf(free, product.minQty),
              maxQty: maxCartQty(free),
            },
          ];
        }),
      );
    },

    async covers(productIds) {
      const byProduct = await coversOf(productIds);
      const links = new Map<string, string>();
      for (const [productId, ids] of byProduct) {
        if (ids[0]) links.set(productId, photos.link(ids[0]));
      }
      return links;
    },

    async reserve(tx, lines) {
      const short: string[] = [];
      for (const line of inProductOrder(lines)) {
        // The check and the change in one statement: nothing can take the stock in between.
        const taken = await tx
          .update(stockLevels)
          .set({ reserved: sql`${stockLevels.reserved} + ${line.qty}::numeric` })
          .where(
            and(
              eq(stockLevels.productId, line.productId),
              sql`${stockLevels.onHand} - ${stockLevels.reserved} >= ${line.qty}::numeric`,
            ),
          )
          .returning({ productId: stockLevels.productId });
        if (taken.length === 0) short.push(line.productId);
      }
      // One line short: the caller's transaction rolls back the lines already reserved.
      if (short.length > 0) {
        throw new AppError('out_of_stock', 'not enough free stock', {
          paths: short.map((productId) => `body.items.${productId}`),
        });
      }
    },

    async release(tx, lines) {
      for (const line of inProductOrder(lines)) {
        await tx
          .update(stockLevels)
          .set({ reserved: sql`${stockLevels.reserved} - ${line.qty}::numeric` })
          .where(eq(stockLevels.productId, line.productId));
      }
    },

    async sell(tx, sale) {
      const ordered = inProductOrder(sale.lines);
      const ids = ordered.map((line) => line.productId);
      // The stock and the costs locked in one order, as a posted document does (section 9.6).
      const levels = await tx
        .select()
        .from(stockLevels)
        .where(inArray(stockLevels.productId, ids))
        .orderBy(asc(stockLevels.productId))
        .for('update');
      const cards = await tx
        .select({ id: products.id, avgCost: products.avgCost })
        .from(products)
        .where(inArray(products.id, ids));
      const levelOf = new Map(levels.map((level) => [level.productId, level]));
      const costOf = new Map(cards.map((card) => [card.id, card.avgCost]));

      const short = ordered.filter((line) => {
        const level = levelOf.get(line.productId);
        if (!level) return true;
        return sale.fromReserve
          ? level.reserved < line.qty
          : roundQty(level.onHand - level.reserved) < line.qty;
      });
      if (short.length > 0) {
        throw new AppError('out_of_stock', 'not enough stock to sell', {
          paths: short.map((line) => `body.items.${line.productId}`),
        });
      }

      const [document] = await tx
        .insert(stockDocuments)
        .values({
          kind: 'sale',
          status: 'posted',
          shopOrderId: sale.shopOrderId,
          postedAt: sale.at,
          postedBy: sale.actorId,
          createdBy: sale.actorId,
          createdAt: sale.at,
        })
        .returning({ id: stockDocuments.id, number: stockDocuments.number });
      if (!document) throw new Error('insert returned no row');
      for (const line of ordered) {
        await tx.insert(stockMovements).values({
          documentId: document.id,
          productId: line.productId,
          delta: -line.qty,
          unitCost: costOf.get(line.productId) ?? 0,
          at: sale.at,
          actorId: sale.actorId,
        });
        await tx
          .update(stockLevels)
          .set({
            onHand: sql`${stockLevels.onHand} - ${line.qty}::numeric`,
            ...(sale.fromReserve && {
              reserved: sql`${stockLevels.reserved} - ${line.qty}::numeric`,
            }),
            updatedAt: sale.at,
          })
          .where(eq(stockLevels.productId, line.productId));
      }
      return { documentNumber: document.number };
    },
  };
}
