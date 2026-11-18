import { BODY_CLASSES, CANCEL_REASON_AUDIENCES, SERVICE_GROUPS } from '@cs/shared/vocabulary';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, idColumn, updatedAt } from './columns';

/** Tables of the catalog module (docs/PLAN.md, section 7.5). Only this module writes them. */

export const bodyClassEnum = pgEnum('body_class', BODY_CLASSES);
export const serviceGroupEnum = pgEnum('service_group', SERVICE_GROUPS);
export const cancelReasonAudienceEnum = pgEnum('cancel_reason_audience', CANCEL_REASON_AUDIENCES);

export const carBrands = pgTable(
  'car_brands',
  {
    id: idColumn(),
    name: text().notNull(),
    sort: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('car_brands_name_unique').on(sql`lower(${t.name})`)],
);

export const carModels = pgTable(
  'car_models',
  {
    id: idColumn(),
    brandId: uuid()
      .notNull()
      .references(() => carBrands.id),
    name: text().notNull(),
    bodyClass: bodyClassEnum().notNull(),
    sort: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('car_models_brand_name_unique').on(t.brandId, sql`lower(${t.name})`)],
);

/** A kind of work: polishing, ceramic coating, … `code` never changes; the names may. */
export const serviceTypes = pgTable('service_types', {
  id: idColumn(),
  code: text().notNull().unique(),
  nameUz: text().notNull(),
  nameRu: text().notNull(),
  /** A Lucide icon name. */
  icon: text().notNull(),
  sort: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A zone of a kind of work (the bonnet, the windscreen): what an order is made of. */
export const services = pgTable('services', {
  id: idColumn(),
  serviceTypeId: uuid()
    .notNull()
    .references(() => serviceTypes.id),
  nameUz: text().notNull(),
  nameRu: text().notNull(),
  group: serviceGroupEnum().notNull(),
  /** "Other": its price is always agreed with the client. */
  isCustom: boolean().notNull().default(false),
  sort: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Choosing `serviceId` drops `excludedServiceId` ("whole body" covers the panels). */
export const serviceExcludes = pgTable(
  'service_excludes',
  {
    serviceId: uuid()
      .notNull()
      .references(() => services.id),
    excludedServiceId: uuid()
      .notNull()
      .references(() => services.id),
  },
  (t) => [
    primaryKey({ columns: [t.serviceId, t.excludedServiceId] }),
    check('service_excludes_not_itself', sql`${t.serviceId} <> ${t.excludedServiceId}`),
  ],
);

/** The price matrix: a zone × a body class. A missing row means "not offered for this class". */
export const servicePrices = pgTable(
  'service_prices',
  {
    serviceId: uuid()
      .notNull()
      .references(() => services.id),
    bodyClass: bodyClassEnum().notNull(),
    /** So‘m; null means the price is agreed with the client. */
    price: bigint({ mode: 'number' }),
    /** Working minutes, also for jobs that take several days. */
    durationMin: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.serviceId, t.bodyClass] }),
    check('service_prices_price_not_negative', sql`${t.price} is null or ${t.price} >= 0`),
    check('service_prices_duration_positive', sql`${t.durationMin} > 0`),
  ],
);

export const cancelReasons = pgTable('cancel_reasons', {
  id: idColumn(),
  code: text().notNull().unique(),
  nameUz: text().notNull(),
  nameRu: text().notNull(),
  appliesTo: cancelReasonAudienceEnum().notNull(),
  /** The person must also write what happened. */
  requiresText: boolean().notNull().default(false),
  sort: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
});
