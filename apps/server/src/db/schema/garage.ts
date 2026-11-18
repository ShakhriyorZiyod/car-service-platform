import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { bodyClassEnum, carModels } from './catalog';
import { createdAt, idColumn, instant, updatedAt } from './columns';
import { users } from './identity';

/** Tables of the garage module (docs/PLAN.md, section 7.6). Only this module writes them. */

export const cars = pgTable(
  'cars',
  {
    id: idColumn(),
    clientId: uuid()
      .notNull()
      .references(() => users.id),
    modelId: uuid().references(() => carModels.id),
    /** What the client typed when their model is not in the list ("Other"). */
    customModelText: text(),
    /** From the model; for "Other" the client picks it from pictures and the admin corrects it. */
    bodyClass: bodyClassEnum().notNull(),
    year: integer().notNull(),
    /** Normalised: upper case, no spaces (shared/format/plate). */
    plate: text().notNull(),
    color: text(),
    archivedAt: instant(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('cars_has_model', sql`${t.modelId} is not null or ${t.customModelText} is not null`),
    check('cars_year_range', sql`${t.year} between 1950 and 2100`),
    uniqueIndex('cars_client_plate_unique')
      .on(t.clientId, t.plate)
      .where(sql`${t.archivedAt} is null`),
  ],
);
