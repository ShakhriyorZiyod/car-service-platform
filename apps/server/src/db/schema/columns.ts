import { sql, type SQL } from 'drizzle-orm';
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

/**
 * A stored phone is in the one form `normalizePhone` gives (PLAN 22, 2026-11-24): "+" and 8 to 15
 * digits, and an Uzbek one exactly "+998" and nine digits. Null passes: no number.
 */
export const phoneFormatCheck = (phone: SQL): SQL =>
  sql`${phone} ~ '^[+][1-9][0-9]{7,14}$' and (${phone} !~ '^[+]998' or ${phone} ~ '^[+]998[0-9]{9}$')`;
