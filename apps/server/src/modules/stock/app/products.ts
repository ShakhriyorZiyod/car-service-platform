import type { PhotoLink, Product, ProductCategory, Supplier } from '@cs/shared';
import { normalizePhone } from '@cs/shared/format';
import { LIMITS, type ProductUnit } from '@cs/shared/vocabulary';
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import type { DbOrTx, Tx } from '../../../db/client';
import {
  media,
  productCategories,
  products,
  stockLevels,
  stockMovements,
  suppliers,
} from '../../../db/schema';
import { requirePermission, type StaffActor } from '../../../platform/actors';
import type { PlatformDeps } from '../../../platform/deps';
import { AppError, invalidAt } from '../../../platform/errors';
import { isMissingReference, violatedUniqueConstraint } from '../../../platform/pg-errors';
import type { AuditService } from '../../audit';
import type { MediaService } from '../../media';
import { productProblems, stockState } from '../domain/stock';

/**
 * Product cards, their categories and photos, and the suppliers (docs/PLAN.md, sections 7.14 and
 * 8). The owner writes them (`products.write`); everyone who sees the warehouse reads them, and
 * the purchase prices only with `costs.read`.
 */

export interface ProductsServiceDeps extends PlatformDeps {
  audit: AuditService;
  media: MediaService;
}

export interface CategoryInput {
  nameUz: string;
  nameRu: string;
  parentId: string | null;
}

export interface CategoryPatch {
  nameUz?: string | undefined;
  nameRu?: string | undefined;
  sort?: number | undefined;
  isActive?: boolean | undefined;
}

export interface SupplierInput {
  name: string;
  phone: string | null;
  inn: string | null;
  note: string | null;
}

export type SupplierPatch = { [K in keyof SupplierInput]?: SupplierInput[K] | undefined } & {
  isActive?: boolean | undefined;
};

export interface ProductInput {
  sku: string;
  barcode: string | null;
  nameUz: string;
  nameRu: string;
  descriptionUz: string | null;
  descriptionRu: string | null;
  categoryId: string;
  brand: string | null;
  unit: ProductUnit;
  pack: string | null;
  isForSale: boolean;
  isConsumable: boolean;
  sellPrice: number | null;
  minQty: number;
}

export type ProductPatch = { [K in keyof ProductInput]?: ProductInput[K] | undefined } & {
  sort?: number | undefined;
  isActive?: boolean | undefined;
};

export interface ProductsService {
  categories(actor: StaffActor): Promise<ProductCategory[]>;
  createCategory(actor: StaffActor, input: CategoryInput, ip?: string): Promise<ProductCategory>;
  updateCategory(
    actor: StaffActor,
    id: string,
    patch: CategoryPatch,
    ip?: string,
  ): Promise<ProductCategory>;

  suppliers(actor: StaffActor): Promise<Supplier[]>;
  createSupplier(actor: StaffActor, input: SupplierInput, ip?: string): Promise<Supplier>;
  updateSupplier(
    actor: StaffActor,
    id: string,
    patch: SupplierPatch,
    ip?: string,
  ): Promise<Supplier>;

  list(actor: StaffActor): Promise<Product[]>;
  create(actor: StaffActor, input: ProductInput, ip?: string): Promise<Product>;
  update(actor: StaffActor, id: string, patch: ProductPatch, ip?: string): Promise<Product>;
  putPhoto(
    actor: StaffActor,
    productId: string,
    upload: { mediaId: string; bytes: Uint8Array },
  ): Promise<PhotoLink>;
  removePhoto(actor: StaffActor, productId: string, mediaId: string): Promise<void>;
}

type CategoryRow = typeof productCategories.$inferSelect;
type SupplierRow = typeof suppliers.$inferSelect;

const toCategory = (row: CategoryRow): ProductCategory => ({
  id: row.id,
  parentId: row.parentId,
  nameUz: row.nameUz,
  nameRu: row.nameRu,
  sort: row.sort,
  isActive: row.isActive,
});

const toSupplier = (row: SupplierRow): Supplier => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  inn: row.inn,
  note: row.note,
  isActive: row.isActive,
});

/** A taken name, article or barcode is a conflict the owner can fix, not a server failure. */
function rethrow(error: unknown): never {
  switch (violatedUniqueConstraint(error)) {
    case 'product_categories_name_unique':
    case 'suppliers_name_unique':
      throw new AppError('name_taken');
    case 'products_sku_unique':
      throw new AppError('sku_taken');
    case 'products_barcode_unique':
      throw new AppError('barcode_taken');
    case undefined:
      break;
  }
  if (isMissingReference(error)) throw invalidAt('body.categoryId', 'no such category');
  throw error;
}

function phoneOf(input: string | null | undefined): string | null | undefined {
  if (input === undefined || input === null) return input;
  const phone = normalizePhone(input);
  if (!phone) throw invalidAt('body.phone', 'not a phone number');
  return phone;
}

export function createProductsService(deps: ProductsServiceDeps): ProductsService {
  const { db, clock, audit, media: photos } = deps;

  async function categoryView(from: DbOrTx, id: string): Promise<ProductCategory> {
    const [row] = await from.select().from(productCategories).where(eq(productCategories.id, id));
    if (!row) throw new AppError('not_found');
    return toCategory(row);
  }

  async function supplierView(from: DbOrTx, id: string): Promise<Supplier> {
    const [row] = await from.select().from(suppliers).where(eq(suppliers.id, id));
    if (!row) throw new AppError('not_found');
    return toSupplier(row);
  }

  /** The cards with their stock and photos; the purchase prices only for who may see them. */
  async function productViews(from: DbOrTx, actor: StaffActor, only?: string): Promise<Product[]> {
    const rows = await from
      .select({ product: products, level: stockLevels })
      .from(products)
      .innerJoin(stockLevels, eq(stockLevels.productId, products.id))
      .where(only ? eq(products.id, only) : undefined)
      .orderBy(asc(products.sort), asc(products.nameUz), asc(products.id));
    if (rows.length === 0) return [];
    const photoRows = await from
      .select({ id: media.id, productId: media.productId })
      .from(media)
      .where(
        inArray(
          media.productId,
          rows.map((row) => row.product.id),
        ),
      )
      .orderBy(asc(media.createdAt), asc(media.id));
    const seesCosts = actor.permissions.has('costs.read');
    return rows.map(({ product, level }) => ({
      id: product.id,
      sku: product.sku,
      barcode: product.barcode,
      nameUz: product.nameUz,
      nameRu: product.nameRu,
      descriptionUz: product.descriptionUz,
      descriptionRu: product.descriptionRu,
      categoryId: product.categoryId,
      brand: product.brand,
      unit: product.unit,
      pack: product.pack,
      isForSale: product.isForSale,
      isConsumable: product.isConsumable,
      sellPrice: product.sellPrice,
      minQty: product.minQty,
      sort: product.sort,
      isActive: product.isActive,
      photos: photoRows
        .filter((photo) => photo.productId === product.id)
        .map((photo) => ({ mediaId: photo.id, url: photos.link(photo.id) })),
      stock: {
        onHand: level.onHand,
        reserved: level.reserved,
        free: Math.round((level.onHand - level.reserved) * 1000) / 1000,
        state: stockState(level, product.minQty),
      },
      costs: seesCosts ? { avgCost: product.avgCost, lastCost: product.lastCost } : null,
    }));
  }

  async function productView(from: DbOrTx, actor: StaffActor, id: string): Promise<Product> {
    const [product] = await productViews(from, actor, id);
    if (!product) throw new AppError('not_found');
    return product;
  }

  /** What the audit log keeps of a card: the card, not its stock, photos or costs. */
  const cardOf = ({ photos: _p, stock: _s, costs: _c, ...card }: Product) => card;

  /** A category is a top-level one or the child of a top-level one: two levels (TZ 14.3). */
  async function checkParent(tx: Tx, parentId: string | null, self?: string): Promise<void> {
    if (parentId === null) return;
    const [parent] = await tx
      .select({ parentId: productCategories.parentId })
      .from(productCategories)
      .where(eq(productCategories.id, parentId));
    if (!parent || parent.parentId !== null || parentId === self) {
      throw invalidAt('body.parentId', 'the parent must be a top-level category');
    }
  }

  async function lockedProduct(tx: Tx, id: string) {
    const [row] = await tx.select().from(products).where(eq(products.id, id)).for('update');
    if (!row) throw new AppError('not_found');
    return row;
  }

  const service: ProductsService = {
    async categories(actor) {
      requirePermission(actor, 'stock.read');
      const rows = await db
        .select()
        .from(productCategories)
        .orderBy(asc(productCategories.sort), asc(productCategories.nameUz));
      return rows.map(toCategory);
    },

    async createCategory(actor, input, ip) {
      requirePermission(actor, 'products.write');
      try {
        return await db.transaction(async (tx) => {
          await checkParent(tx, input.parentId);
          const [last] = await tx
            .select({ sort: sql<number>`coalesce(max(${productCategories.sort}), 0)` })
            .from(productCategories);
          const [row] = await tx
            .insert(productCategories)
            .values({ ...input, sort: (last?.sort ?? 0) + 1 })
            .returning();
          if (!row) throw new Error('insert returned no row');
          const category = toCategory(row);
          await audit.record(tx, {
            actorId: actor.userId,
            action: 'product_category.create',
            entity: 'product_category',
            entityId: category.id,
            after: category,
            ip: ip ?? null,
          });
          return category;
        });
      } catch (error) {
        rethrow(error);
      }
    },

    async updateCategory(actor, id, patch, ip) {
      requirePermission(actor, 'products.write');
      try {
        return await db.transaction(async (tx) => {
          const [row] = await tx
            .select()
            .from(productCategories)
            .where(eq(productCategories.id, id))
            .for('update');
          if (!row) throw new AppError('not_found');
          const before = toCategory(row);
          await tx
            .update(productCategories)
            .set({
              nameUz: patch.nameUz ?? row.nameUz,
              nameRu: patch.nameRu ?? row.nameRu,
              sort: patch.sort ?? row.sort,
              isActive: patch.isActive ?? row.isActive,
              updatedAt: clock.now(),
            })
            .where(eq(productCategories.id, id));
          const after = await categoryView(tx, id);
          if (JSON.stringify(before) !== JSON.stringify(after)) {
            await audit.record(tx, {
              actorId: actor.userId,
              action: 'product_category.update',
              entity: 'product_category',
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

    async suppliers(actor) {
      requirePermission(actor, 'stock.read');
      const rows = await db
        .select()
        .from(suppliers)
        .orderBy(asc(suppliers.name), asc(suppliers.id));
      return rows.map(toSupplier);
    },

    async createSupplier(actor, input, ip) {
      requirePermission(actor, 'products.write');
      const phone = phoneOf(input.phone) ?? null;
      try {
        return await db.transaction(async (tx) => {
          const [row] = await tx
            .insert(suppliers)
            .values({ ...input, phone })
            .returning();
          if (!row) throw new Error('insert returned no row');
          const supplier = toSupplier(row);
          await audit.record(tx, {
            actorId: actor.userId,
            action: 'supplier.create',
            entity: 'supplier',
            entityId: supplier.id,
            after: supplier,
            ip: ip ?? null,
          });
          return supplier;
        });
      } catch (error) {
        rethrow(error);
      }
    },

    async updateSupplier(actor, id, patch, ip) {
      requirePermission(actor, 'products.write');
      const phone = phoneOf(patch.phone);
      try {
        return await db.transaction(async (tx) => {
          const [row] = await tx.select().from(suppliers).where(eq(suppliers.id, id)).for('update');
          if (!row) throw new AppError('not_found');
          const before = toSupplier(row);
          await tx
            .update(suppliers)
            .set({
              name: patch.name ?? row.name,
              phone: phone === undefined ? row.phone : phone,
              inn: patch.inn === undefined ? row.inn : patch.inn,
              note: patch.note === undefined ? row.note : patch.note,
              isActive: patch.isActive ?? row.isActive,
              updatedAt: clock.now(),
            })
            .where(eq(suppliers.id, id));
          const after = await supplierView(tx, id);
          if (JSON.stringify(before) !== JSON.stringify(after)) {
            await audit.record(tx, {
              actorId: actor.userId,
              action: 'supplier.update',
              entity: 'supplier',
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

    async list(actor) {
      requirePermission(actor, 'stock.read');
      return productViews(db, actor);
    },

    async create(actor, input, ip) {
      requirePermission(actor, 'products.write');
      const problems = productProblems(input);
      if (problems.length > 0)
        throw new AppError('validation', 'product card', { paths: problems });
      try {
        return await db.transaction(async (tx) => {
          const [last] = await tx
            .select({ sort: sql<number>`coalesce(max(${products.sort}), 0)` })
            .from(products);
          const [row] = await tx
            .insert(products)
            .values({ ...input, sort: (last?.sort ?? 0) + 1 })
            .returning({ id: products.id });
          if (!row) throw new Error('insert returned no row');
          await tx.insert(stockLevels).values({ productId: row.id });
          const product = await productView(tx, actor, row.id);
          await audit.record(tx, {
            actorId: actor.userId,
            action: 'product.create',
            entity: 'product',
            entityId: product.id,
            after: cardOf(product),
            ip: ip ?? null,
          });
          return product;
        });
      } catch (error) {
        rethrow(error);
      }
    },

    async update(actor, id, patch, ip) {
      requirePermission(actor, 'products.write');
      try {
        return await db.transaction(async (tx) => {
          const row = await lockedProduct(tx, id);
          const next = {
            sku: patch.sku ?? row.sku,
            barcode: patch.barcode === undefined ? row.barcode : patch.barcode,
            nameUz: patch.nameUz ?? row.nameUz,
            nameRu: patch.nameRu ?? row.nameRu,
            descriptionUz:
              patch.descriptionUz === undefined ? row.descriptionUz : patch.descriptionUz,
            descriptionRu:
              patch.descriptionRu === undefined ? row.descriptionRu : patch.descriptionRu,
            categoryId: patch.categoryId ?? row.categoryId,
            brand: patch.brand === undefined ? row.brand : patch.brand,
            unit: patch.unit ?? row.unit,
            pack: patch.pack === undefined ? row.pack : patch.pack,
            isForSale: patch.isForSale ?? row.isForSale,
            isConsumable: patch.isConsumable ?? row.isConsumable,
            sellPrice: patch.sellPrice === undefined ? row.sellPrice : patch.sellPrice,
            minQty: patch.minQty ?? row.minQty,
            sort: patch.sort ?? row.sort,
            isActive: patch.isActive ?? row.isActive,
          };
          const problems = productProblems(next);
          if (problems.length > 0) {
            throw new AppError('validation', 'product card', { paths: problems });
          }
          // 12 litres must not turn into 12 pieces: the unit is fixed once the stock has moved.
          if (next.unit !== row.unit) {
            const [moved] = await tx
              .select({ n: count() })
              .from(stockMovements)
              .where(eq(stockMovements.productId, id));
            if ((moved?.n ?? 0) > 0) throw invalidAt('body.unit', 'the stock has moved already');
          }
          const before = cardOf(await productView(tx, actor, id));
          await tx
            .update(products)
            .set({ ...next, updatedAt: clock.now() })
            .where(eq(products.id, id));
          const product = await productView(tx, actor, id);
          const after = cardOf(product);
          if (JSON.stringify(before) !== JSON.stringify(after)) {
            await audit.record(tx, {
              actorId: actor.userId,
              action: 'product.update',
              entity: 'product',
              entityId: id,
              before,
              after,
              ip: ip ?? null,
            });
          }
          return product;
        });
      } catch (error) {
        rethrow(error);
      }
    },

    async putPhoto(actor, productId, upload) {
      requirePermission(actor, 'products.write');
      return db.transaction(async (tx) => {
        await lockedProduct(tx, productId);
        const existing = await photos.ofProduct(tx, productId);
        const isRepeat = existing.some((photo) => photo.id === upload.mediaId);
        if (!isRepeat && existing.length >= LIMITS.productPhotos.max) {
          throw invalidAt('params.mediaId', 'a product has at most five photos');
        }
        const photo = await photos.put(tx, {
          id: upload.mediaId,
          purpose: 'product_photo',
          side: null,
          owner: { kind: 'product', productId },
          bytes: upload.bytes,
          uploadedBy: actor.userId,
        });
        return { mediaId: photo.id, url: photos.link(photo.id) };
      });
    },

    async removePhoto(actor, productId, mediaId) {
      requirePermission(actor, 'products.write');
      await db.transaction(async (tx) => {
        const [photo] = await tx
          .select({ id: media.id })
          .from(media)
          .where(and(eq(media.id, mediaId), eq(media.productId, productId)));
        if (!photo) throw new AppError('not_found');
        await photos.remove(tx, mediaId);
      });
    },
  };
  return service;
}
