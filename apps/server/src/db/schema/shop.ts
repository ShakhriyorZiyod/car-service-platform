import { SHOP_FULFILLMENTS, SHOP_ORDER_SOURCES, SHOP_ORDER_STATUSES } from '@cs/shared/vocabulary';
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { cancelReasons } from './catalog';
import { createdAt, idColumn, instant, updatedAt } from './columns';
import { users } from './identity';
import { callOutcomeEnum, orders } from './orders';
import { products } from './stock';

/**
 * Tables of the shop module (docs/PLAN.md, sections 7.15 and 9.5). Only this module writes them.
 * What an order holds is reserved in `stock_levels` from the moment it is placed.
 */

export const shopOrderStatusEnum = pgEnum('shop_order_status', SHOP_ORDER_STATUSES);
export const shopOrderSourceEnum = pgEnum('shop_order_source', SHOP_ORDER_SOURCES);
export const shopFulfillmentEnum = pgEnum('shop_fulfillment', SHOP_FULFILLMENTS);

export const shopOrders = pgTable(
  'shop_orders',
  {
    id: idColumn(),
    /** One sequence with the service orders: "№1043" is never two different things. */
    number: integer()
      .notNull()
      .unique()
      .default(sql`nextval('order_number_seq')`),
    status: shopOrderStatusEnum().notNull(),
    source: shopOrderSourceEnum().notNull(),
    /** Null for a quick sale to somebody the workshop does not know. */
    clientId: uuid().references(() => users.id),
    fulfillment: shopFulfillmentEnum().notNull().default('pickup'),
    /** The service order the goods go with (stage 10). */
    serviceOrderId: uuid().references(() => orders.id),
    subtotal: bigint({ mode: 'number' }).notNull(),
    discountAmount: bigint({ mode: 'number' }).notNull().default(0),
    discountPercent: numeric({ precision: 5, scale: 2, mode: 'number' }),
    discountReason: text(),
    discountBy: uuid().references(() => users.id),
    total: bigint({ mode: 'number' }).notNull(),
    clientComment: text(),
    /** A new order waits for the call until then; afterwards the system cancels it. */
    holdUntil: instant(),
    /** A gathered order waits to be picked up until then. */
    pickupUntil: instant(),
    confirmedAt: instant(),
    confirmedBy: uuid().references(() => users.id),
    readyAt: instant(),
    readyBy: uuid().references(() => users.id),
    completedAt: instant(),
    cancelledAt: instant(),
    cancelledBy: uuid().references(() => users.id),
    cancelReasonId: uuid().references(() => cancelReasons.id),
    cancelNote: text(),
    clientRequestId: uuid(),
    /** Null when the client placed it in the Mini App. */
    createdBy: uuid().references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('shop_orders_total', sql`${t.total} = ${t.subtotal} - ${t.discountAmount}`),
    check(
      'shop_orders_discount_range',
      sql`${t.discountAmount} >= 0 and ${t.discountAmount} <= ${t.subtotal}`,
    ),
    check('shop_orders_tma_has_client', sql`${t.source} <> 'tma' or ${t.clientId} is not null`),
    check(
      'shop_orders_with_service_has_order',
      sql`(${t.fulfillment} = 'with_service') = (${t.serviceOrderId} is not null)`,
    ),
    uniqueIndex('shop_orders_client_request_unique')
      .on(t.clientId, t.clientRequestId)
      .where(sql`${t.clientRequestId} is not null`),
    index('shop_orders_status_idx').on(t.status, t.createdAt),
    index('shop_orders_client_idx').on(t.clientId, t.createdAt),
  ],
);

/** What was ordered, its name and price copied as they were then (PLAN 2, rule 6). */
export const shopOrderItems = pgTable(
  'shop_order_items',
  {
    id: idColumn(),
    shopOrderId: uuid()
      .notNull()
      .references(() => shopOrders.id),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    nameUz: text().notNull(),
    nameRu: text().notNull(),
    pack: text(),
    price: bigint({ mode: 'number' }).notNull(),
    qty: integer().notNull(),
    lineTotal: bigint({ mode: 'number' }).notNull(),
  },
  (t) => [
    uniqueIndex('shop_order_items_product_unique').on(t.shopOrderId, t.productId),
    check('shop_order_items_qty_positive', sql`${t.qty} > 0`),
    check('shop_order_items_line_total', sql`${t.lineTotal} = ${t.price} * ${t.qty}`),
  ],
);

export const shopOrderCalls = pgTable(
  'shop_order_calls',
  {
    id: idColumn(),
    shopOrderId: uuid()
      .notNull()
      .references(() => shopOrders.id),
    adminId: uuid()
      .notNull()
      .references(() => users.id),
    outcome: callOutcomeEnum().notNull(),
    note: text(),
    at: instant().notNull(),
  },
  (t) => [index('shop_order_calls_order_idx').on(t.shopOrderId, t.at)],
);
