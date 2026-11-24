import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  uuid,
} from 'drizzle-orm/pg-core';
import { serviceTypes } from './catalog';
import { createdAt, idColumn, phoneFormatCheck, updatedAt } from './columns';
import { users } from './identity';

/** Tables of the workshop module (docs/PLAN.md, section 7.4). Only this module writes them. */

/**
 * The workshop's settings: one row, `data` holds what the owner changed. What is missing is read
 * from the defaults in the code, so a new setting needs no migration.
 */
export const settings = pgTable(
  'settings',
  {
    id: integer().primaryKey().default(1),
    data: jsonb().notNull(),
    updatedAt: updatedAt(),
    updatedBy: uuid().references(() => users.id),
  },
  (t) => [
    check('settings_single_row', sql`${t.id} = 1`),
    // The workshop's phone, shown to clients ("Servisga qo'ng'iroq qilish").
    check(
      'settings_workshop_phone_format',
      phoneFormatCheck(sql`(${t.data} -> 'workshop' ->> 'phone')`),
    ),
  ],
);

/** One row per working weekday (1 = Monday … 7 = Sunday); a weekday without a row is a day off. */
export const workHours = pgTable(
  'work_hours',
  {
    weekday: smallint().primaryKey(),
    open: time({ precision: 0 }).notNull(),
    close: time({ precision: 0 }).notNull(),
    breakStart: time({ precision: 0 }),
    breakEnd: time({ precision: 0 }),
  },
  (t) => [
    check('work_hours_weekday_range', sql`${t.weekday} between 1 and 7`),
    check('work_hours_close_after_open', sql`${t.close} > ${t.open}`),
    check('work_hours_break_complete', sql`(${t.breakStart} is null) = (${t.breakEnd} is null)`),
    check(
      'work_hours_break_inside',
      sql`${t.breakStart} is null or (${t.breakStart} >= ${t.open} and ${t.breakEnd} <= ${t.close} and ${t.breakEnd} > ${t.breakStart})`,
    ),
  ],
);

export const holidays = pgTable('holidays', {
  date: date({ mode: 'string' }).primaryKey(),
  name: text().notNull(),
});

export const boxes = pgTable('boxes', {
  id: idColumn(),
  name: text().notNull(),
  sort: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
  note: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** The kinds of work a box can do. */
export const boxServiceTypes = pgTable(
  'box_service_types',
  {
    boxId: uuid()
      .notNull()
      .references(() => boxes.id),
    serviceTypeId: uuid()
      .notNull()
      .references(() => serviceTypes.id),
  },
  (t) => [primaryKey({ columns: [t.boxId, t.serviceTypeId] })],
);
