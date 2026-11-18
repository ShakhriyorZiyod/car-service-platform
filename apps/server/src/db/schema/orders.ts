import {
  APPROVAL_CHANNELS,
  CALL_OUTCOMES,
  ITEM_APPROVALS,
  ORDER_ITEM_KINDS,
  ORDER_SOURCES,
  ORDER_STATUSES,
} from '@cs/shared/vocabulary';
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  smallint,
  numeric,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { bodyClassEnum, cancelReasons, services, serviceTypes } from './catalog';
import { createdAt, idColumn, instant, updatedAt } from './columns';
import { cars } from './garage';
import { users } from './identity';
import { tasks } from './tasks';

/** Tables of the orders module (docs/PLAN.md, section 7.8). Only this module writes them. */

export const orderStatusEnum = pgEnum('order_status', ORDER_STATUSES);
export const orderSourceEnum = pgEnum('order_source', ORDER_SOURCES);
export const orderItemKindEnum = pgEnum('order_item_kind', ORDER_ITEM_KINDS);
export const itemApprovalEnum = pgEnum('item_approval', ITEM_APPROVALS);
export const approvalChannelEnum = pgEnum('approval_channel', APPROVAL_CHANNELS);
export const callOutcomeEnum = pgEnum('call_outcome', CALL_OUTCOMES);

export const orders = pgTable(
  'orders',
  {
    id: idColumn(),
    /** The number people read out: "№1042". From `order_number_seq`, which starts at 1001. */
    number: integer()
      .notNull()
      .unique()
      .default(sql`nextval('order_number_seq')`),
    status: orderStatusEnum().notNull(),
    source: orderSourceEnum().notNull(),
    clientId: uuid()
      .notNull()
      .references(() => users.id),
    carId: uuid()
      .notNull()
      .references(() => cars.id),
    /** The car as it was when the order was made: brand, model, year, plate, colour, class. */
    carSnapshot: jsonb().notNull(),
    /** The class the prices were taken at, copied (PLAN 2, rule 6). */
    bodyClass: bodyClassEnum().notNull(),
    clientComment: text(),
    subtotal: bigint({ mode: 'number' }).notNull(),
    discountAmount: bigint({ mode: 'number' }).notNull().default(0),
    discountPercent: numeric({ precision: 5, scale: 2, mode: 'number' }),
    discountReason: text(),
    discountBy: uuid().references(() => users.id),
    total: bigint({ mode: 'number' }).notNull(),
    /** A new order holds its slot until then, waiting for the admin's call. */
    holdUntil: instant(),
    rescheduleRequestedAt: instant(),
    confirmedAt: instant(),
    confirmedBy: uuid().references(() => users.id),
    workStartedAt: instant(),
    readyAt: instant(),
    completedAt: instant(),
    cancelledAt: instant(),
    cancelledBy: uuid().references(() => users.id),
    cancelReasonId: uuid().references(() => cancelReasons.id),
    cancelNote: text(),
    /** The client's key for "create this order": a repeated request gives the same order. */
    clientRequestId: uuid(),
    /** Null when the client made it themselves. */
    createdBy: uuid().references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'orders_total_is_subtotal_less_discount',
      sql`${t.total} = ${t.subtotal} - ${t.discountAmount}`,
    ),
    check(
      'orders_discount_range',
      sql`${t.discountAmount} >= 0 and ${t.discountAmount} <= ${t.subtotal}`,
    ),
    check('orders_hold_only_when_new', sql`${t.holdUntil} is null or ${t.status} = 'new'`),
    unique('orders_client_request_unique').on(t.clientId, t.clientRequestId),
    index('orders_client_idx').on(t.clientId, t.createdAt),
    index('orders_status_idx').on(t.status),
  ],
);

/** One zone of an order, with name, price and time copied from the price list. */
export const orderItems = pgTable(
  'order_items',
  {
    id: idColumn(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id),
    serviceId: uuid()
      .notNull()
      .references(() => services.id),
    serviceTypeId: uuid()
      .notNull()
      .references(() => serviceTypes.id),
    nameUz: text().notNull(),
    nameRu: text().notNull(),
    typeNameUz: text().notNull(),
    typeNameRu: text().notNull(),
    bodyClass: bodyClassEnum().notNull(),
    /** Null: the price is agreed with the client. */
    price: bigint({ mode: 'number' }),
    durationMin: integer().notNull(),
    comment: text(),
    kind: orderItemKindEnum().notNull().default('booked'),
    approval: itemApprovalEnum().notNull().default('not_required'),
    approvalVia: approvalChannelEnum(),
    approvalAt: instant(),
    /** The task that does this item (stage 5). */
    taskId: uuid().references((): AnyPgColumn => tasks.id),
    createdBy: uuid().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    check('order_items_price_not_negative', sql`${t.price} is null or ${t.price} >= 0`),
    check('order_items_duration_positive', sql`${t.durationMin} > 0`),
    index('order_items_order_idx').on(t.orderId),
  ],
);

/** The admin's calls to the client about an order (stage 4). */
export const orderCalls = pgTable(
  'order_calls',
  {
    id: idColumn(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id),
    adminId: uuid()
      .notNull()
      .references(() => users.id),
    outcome: callOutcomeEnum().notNull(),
    note: text(),
    at: instant().notNull(),
  },
  (t) => [index('order_calls_order_idx').on(t.orderId, t.at)],
);

/** The client's rating of a finished order, given once; the words may follow the stars (stage 6). */
export const reviews = pgTable(
  'reviews',
  {
    orderId: uuid()
      .primaryKey()
      .references(() => orders.id),
    clientId: uuid()
      .notNull()
      .references(() => users.id),
    rating: smallint().notNull(),
    text: text(),
    createdAt: createdAt(),
  },
  (t) => [check('reviews_rating_range', sql`${t.rating} between 1 and 5`)],
);
