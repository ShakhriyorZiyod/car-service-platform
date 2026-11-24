import {
  PRODUCT_UNITS,
  STOCK_DOCUMENT_KINDS,
  STOCK_DOCUMENT_STATUSES,
  WRITE_OFF_REASONS,
} from '@cs/shared/vocabulary';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  type AnyPgColumn,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, idColumn, instant, updatedAt } from './columns';
import { users } from './identity';

/**
 * Tables of the stock module (docs/PLAN.md, sections 7.14 and 9.6). Only this module writes them.
 * The stock is never typed in: it is the sum of the movements of posted documents.
 */

export const productUnitEnum = pgEnum('product_unit', PRODUCT_UNITS);
export const stockDocumentKindEnum = pgEnum('stock_document_kind', STOCK_DOCUMENT_KINDS);
export const stockDocumentStatusEnum = pgEnum('stock_document_status', STOCK_DOCUMENT_STATUSES);
export const writeOffReasonEnum = pgEnum('write_off_reason', WRITE_OFF_REASONS);

/** A quantity in the product's unit: whole pieces, or litres, metres and kilograms to 0.001. */
const quantity = () => numeric({ precision: 12, scale: 3, mode: 'number' });

/** Two levels: "Aksessuarlar → Sochiqlar" (TZ 14.3). */
export const productCategories = pgTable(
  'product_categories',
  {
    id: idColumn(),
    parentId: uuid().references((): AnyPgColumn => productCategories.id),
    nameUz: text().notNull(),
    nameRu: text().notNull(),
    sort: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('product_categories_not_own_parent', sql`${t.parentId} is distinct from ${t.id}`),
    uniqueIndex('product_categories_name_unique').on(
      sql`coalesce(${t.parentId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`lower(${t.nameUz})`,
    ),
  ],
);

export const products = pgTable(
  'products',
  {
    id: idColumn(),
    sku: text().notNull(),
    barcode: text(),
    nameUz: text().notNull(),
    nameRu: text().notNull(),
    descriptionUz: text(),
    descriptionRu: text(),
    categoryId: uuid()
      .notNull()
      .references(() => productCategories.id),
    brand: text(),
    unit: productUnitEnum().notNull(),
    /** As written on the card: "1 l", "0,5 l". */
    pack: text(),
    isForSale: boolean().notNull().default(false),
    isConsumable: boolean().notNull().default(false),
    sellPrice: bigint({ mode: 'number' }),
    minQty: quantity().notNull().default(0),
    /** So‘m per unit, weighted by the receipts (docs/PLAN.md, section 9.6). */
    avgCost: bigint({ mode: 'number' }).notNull().default(0),
    lastCost: bigint({ mode: 'number' }),
    sort: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('products_sku_unique').on(sql`lower(${t.sku})`),
    uniqueIndex('products_barcode_unique').on(t.barcode),
    // Goods for sale are sold in whole pieces and always have a price.
    check(
      'products_for_sale_priced_in_pieces',
      sql`not ${t.isForSale} or (${t.unit} = 'pcs' and ${t.sellPrice} is not null)`,
    ),
    check('products_has_a_use', sql`${t.isForSale} or ${t.isConsumable}`),
    check('products_sell_price_not_negative', sql`${t.sellPrice} is null or ${t.sellPrice} >= 0`),
    check(
      'products_costs_not_negative',
      sql`${t.avgCost} >= 0 and coalesce(${t.lastCost}, 0) >= 0`,
    ),
    check('products_min_qty_not_negative', sql`${t.minQty} >= 0`),
    index('products_category_idx').on(t.categoryId),
  ],
);

/**
 * What there is of a product and how much of it is promised to shop orders. Changed only together
 * with a movement (or a reservation, stage 9), in the same transaction.
 */
export const stockLevels = pgTable(
  'stock_levels',
  {
    productId: uuid()
      .primaryKey()
      .references(() => products.id),
    onHand: quantity().notNull().default(0),
    reserved: quantity().notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'stock_levels_consistent',
      sql`${t.onHand} >= 0 and ${t.reserved} >= 0 and ${t.reserved} <= ${t.onHand}`,
    ),
  ],
);

export const suppliers = pgTable(
  'suppliers',
  {
    id: idColumn(),
    name: text().notNull(),
    phone: text(),
    inn: text(),
    note: text(),
    isActive: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('suppliers_name_unique').on(sql`lower(${t.name})`)],
);

export const stockDocuments = pgTable(
  'stock_documents',
  {
    id: idColumn(),
    /** "Kirim №59". From `stock_document_number_seq`. */
    number: integer()
      .notNull()
      .unique()
      .default(sql`nextval('stock_document_number_seq')`),
    kind: stockDocumentKindEnum().notNull(),
    status: stockDocumentStatusEnum().notNull().default('draft'),
    supplierId: uuid().references(() => suppliers.id),
    invoiceNo: text(),
    invoiceDate: date({ mode: 'string' }),
    reason: writeOffReasonEnum(),
    note: text(),
    /** The shop order a sale belongs to (stage 9); no foreign key until that table exists. */
    shopOrderId: uuid(),
    postedAt: instant(),
    postedBy: uuid().references(() => users.id),
    createdBy: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // A draft may still lack its reason; a posted write-off has one (section 9.6).
    check(
      'stock_documents_write_off_reason',
      sql`${t.kind} <> 'write_off' or ${t.status} = 'draft' or ${t.reason} is not null`,
    ),
    check(
      'stock_documents_posted_fields',
      sql`(${t.status} = 'posted') = (${t.postedAt} is not null and ${t.postedBy} is not null)`,
    ),
    check(
      'stock_documents_supplier_only_on_receipts',
      sql`${t.kind} = 'receipt' or (${t.supplierId} is null and ${t.invoiceNo} is null)`,
    ),
    index('stock_documents_kind_idx').on(t.kind, t.createdAt),
  ],
);

export const stockDocumentLines = pgTable(
  'stock_document_lines',
  {
    id: idColumn(),
    documentId: uuid()
      .notNull()
      .references(() => stockDocuments.id),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    /** Received or written off (> 0); counted in an inventory (≥ 0). */
    qty: quantity().notNull(),
    /** The purchase price of a receipt line, so‘m per unit. */
    unitCost: bigint({ mode: 'number' }),
    /** What the books said when an inventory was posted. */
    expectedQty: quantity(),
  },
  (t) => [
    uniqueIndex('stock_document_lines_product_unique').on(t.documentId, t.productId),
    check('stock_document_lines_qty_not_negative', sql`${t.qty} >= 0`),
    check(
      'stock_document_lines_cost_not_negative',
      sql`${t.unitCost} is null or ${t.unitCost} >= 0`,
    ),
  ],
);

/** The journal of every change to the stock. Append-only: a trigger refuses UPDATE and DELETE. */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: idColumn(),
    documentId: uuid()
      .notNull()
      .references(() => stockDocuments.id),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    delta: quantity().notNull(),
    /** The cost per unit the movement carried: the purchase price in, the average cost out. */
    unitCost: bigint({ mode: 'number' }).notNull(),
    at: instant().notNull(),
    actorId: uuid().references(() => users.id),
  },
  (t) => [
    check('stock_movements_delta_not_zero', sql`${t.delta} <> 0`),
    index('stock_movements_product_idx').on(t.productId, t.at),
    index('stock_movements_at_idx').on(t.at),
  ],
);
