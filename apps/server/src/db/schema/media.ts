import { MEDIA_PURPOSES, PHOTO_SIDES } from '@cs/shared/vocabulary';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt } from './columns';
import { users } from './identity';
import { receptionActs } from './reception';
import { products, stockDocuments } from './stock';
import { tasks } from './tasks';

/** Tables of the media module (docs/PLAN.md, section 7.11). Only this module writes them. */

export const mediaPurposeEnum = pgEnum('media_purpose', MEDIA_PURPOSES);
export const photoSideEnum = pgEnum('photo_side', PHOTO_SIDES);

/**
 * A photo. The file itself lies in the file store under `storage_key`, a random name; the row says
 * what the photo is for. The client makes the id, so uploading the same photo again is harmless.
 */
export const media = pgTable(
  'media',
  {
    id: uuid().primaryKey(),
    purpose: mediaPurposeEnum().notNull(),
    /** Which of the four sides of the car (only `reception_side`). */
    side: photoSideEnum(),
    receptionActId: uuid().references(() => receptionActs.id),
    taskId: uuid().references(() => tasks.id),
    /** The attempt of the task the photo belongs to: a rework starts a new one. */
    attempt: integer(),
    /** A photo of a product for the shop's card (stage 8). */
    productId: uuid().references(() => products.id),
    /** The supplier's invoice of a receipt (stage 8). */
    stockDocumentId: uuid().references(() => stockDocuments.id),
    storageKey: text().notNull().unique(),
    mime: text().notNull(),
    bytes: integer().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    uploadedBy: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'media_one_owner',
      sql`num_nonnulls(${t.receptionActId}, ${t.taskId}, ${t.productId}, ${t.stockDocumentId}) = 1`,
    ),
    check(
      'media_purpose_fits_owner',
      sql`(${t.purpose} in ('reception_side', 'reception_defect') and ${t.receptionActId} is not null)
        or (${t.purpose} in ('task_before', 'task_after') and ${t.taskId} is not null and ${t.attempt} is not null)
        or (${t.purpose}::text = 'product_photo' and ${t.productId} is not null)
        or (${t.purpose}::text = 'stock_invoice' and ${t.stockDocumentId} is not null)`,
    ),
    check(
      'media_side_only_for_sides',
      sql`(${t.purpose} = 'reception_side') = (${t.side} is not null)`,
    ),
    check('media_size_positive', sql`${t.bytes} > 0 and ${t.width} > 0 and ${t.height} > 0`),
    // One photo per side of the car in an act.
    uniqueIndex('media_one_photo_per_side')
      .on(t.receptionActId, t.side)
      .where(sql`${t.purpose} = 'reception_side'`),
    index('media_task_idx').on(t.taskId, t.attempt),
    index('media_act_idx').on(t.receptionActId),
    // One invoice per document is kept by the media service, under the document's lock: an index
    // here would compare a value the enum gains in the same migration, which PostgreSQL refuses.
    index('media_product_idx').on(t.productId),
    index('media_stock_document_idx').on(t.stockDocumentId),
  ],
);
