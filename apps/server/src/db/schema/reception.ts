import {
  ACT_CONFIRM_CHANNELS,
  ACT_STATUSES,
  DEFECT_KINDS,
  DEFECT_VIEWS,
} from '@cs/shared/vocabulary';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { createdAt, idColumn, instant, updatedAt } from './columns';
import { users } from './identity';
import { media } from './media';
import { orders } from './orders';

/** Tables of the reception module (docs/PLAN.md, section 7.9). Only this module writes them. */

export const actStatusEnum = pgEnum('act_status', ACT_STATUSES);
export const actConfirmChannelEnum = pgEnum('act_confirm_channel', ACT_CONFIRM_CHANNELS);
export const defectViewEnum = pgEnum('defect_view', DEFECT_VIEWS);
export const defectKindEnum = pgEnum('defect_kind', DEFECT_KINDS);

/** The act of taking the car in: its state, what the client leaves in it, and who agreed. */
export const receptionActs = pgTable(
  'reception_acts',
  {
    id: idColumn(),
    orderId: uuid()
      .notNull()
      .unique()
      .references(() => orders.id),
    status: actStatusEnum().notNull().default('draft'),
    /** Both are empty in a draft and required once the act is sent. */
    mileageKm: integer(),
    /** In quarters of a tank: 0 empty … 4 full. */
    fuelLevel: integer(),
    /** `spareWheel`, `jack`, `mats`, `documents`: true when present. */
    checklist: jsonb().notNull().default({}),
    personalItems: text(),
    sentAt: instant(),
    confirmedAt: instant(),
    confirmedVia: actConfirmChannelEnum(),
    /** The admin who wrote down a verbal confirmation. */
    confirmedBy: uuid().references(() => users.id),
    createdBy: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'reception_acts_fuel_range',
      sql`${t.fuelLevel} is null or ${t.fuelLevel} between 0 and 4`,
    ),
    check('reception_acts_mileage_range', sql`${t.mileageKm} is null or ${t.mileageKm} >= 0`),
    check(
      'reception_acts_sent_is_complete',
      sql`${t.status} = 'draft' or (${t.mileageKm} is not null and ${t.fuelLevel} is not null and ${t.sentAt} is not null)`,
    ),
    check(
      'reception_acts_confirmed_is_signed',
      sql`${t.status} <> 'confirmed' or (${t.confirmedAt} is not null and ${t.confirmedVia} is not null)`,
    ),
    check(
      'reception_acts_verbal_has_witness',
      sql`${t.confirmedVia} is distinct from 'verbal' or ${t.confirmedBy} is not null`,
    ),
  ],
);

/** A defect marked on a view of the car (design A2, BodySchema), with a note and maybe a photo. */
export const receptionDefects = pgTable(
  'reception_defects',
  {
    id: idColumn(),
    actId: uuid()
      .notNull()
      .references(() => receptionActs.id),
    view: defectViewEnum().notNull(),
    /** Where on the picture of the view, 0–1 from the top left. */
    x: numeric({ precision: 5, scale: 4, mode: 'number' }).notNull(),
    y: numeric({ precision: 5, scale: 4, mode: 'number' }).notNull(),
    kind: defectKindEnum().notNull(),
    note: text(),
    mediaId: uuid().references((): AnyPgColumn => media.id),
    sort: integer().notNull().default(0),
  },
  (t) => [
    check('reception_defects_x_range', sql`${t.x} between 0 and 1`),
    check('reception_defects_y_range', sql`${t.y} between 0 and 1`),
    index('reception_defects_act_idx').on(t.actId, t.sort),
  ],
);
