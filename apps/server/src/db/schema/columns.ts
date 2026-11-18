import { timestamp, uuid } from 'drizzle-orm/pg-core';
import { newId } from '../../lib/ids';

/** Shared column builders, so every table spells them the same way (docs/PLAN.md, section 7.1). */

export const idColumn = () => uuid().primaryKey().$defaultFn(newId);

export const instant = () => timestamp({ withTimezone: true, mode: 'date' });

export const createdAt = () => instant().notNull().defaultNow();

export const updatedAt = () =>
  instant()
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date());
