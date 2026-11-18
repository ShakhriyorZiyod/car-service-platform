import { FISCAL_PROVIDERS, FISCAL_STATUSES, PAYMENT_METHODS } from '@cs/shared/vocabulary';
import { sql } from 'drizzle-orm';
import { bigint, check, index, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, idColumn, instant } from './columns';
import { users } from './identity';
import { orders } from './orders';

/**
 * Tables of the payments module (docs/PLAN.md, section 7.12). Only this module writes them, and
 * nothing is ever deleted: a wrong method is corrected in place by the owner, with an audit entry.
 */

export const paymentMethodEnum = pgEnum('payment_method', PAYMENT_METHODS);
export const fiscalProviderEnum = pgEnum('fiscal_provider', FISCAL_PROVIDERS);
export const fiscalStatusEnum = pgEnum('fiscal_status', FISCAL_STATUSES);

/** Money taken for an order at checkout; a mixed payment is one row per method. */
export const payments = pgTable(
  'payments',
  {
    id: idColumn(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id),
    method: paymentMethodEnum().notNull(),
    amount: bigint({ mode: 'number' }).notNull(),
    receivedBy: uuid()
      .notNull()
      .references(() => users.id),
    receivedAt: instant().notNull(),
  },
  (t) => [
    check('payments_amount_positive', sql`${t.amount} > 0`),
    index('payments_order_idx').on(t.orderId),
    index('payments_received_at_idx').on(t.receivedAt),
  ],
);

/**
 * The fiscal receipt of an order: one per order. `request_id` is the checkout's key, so the same
 * checkout sent twice finds the receipt it already made (docs/PLAN.md, section 11).
 */
export const fiscalReceipts = pgTable('fiscal_receipts', {
  id: idColumn(),
  orderId: uuid()
    .notNull()
    .unique()
    .references(() => orders.id),
  provider: fiscalProviderEnum().notNull(),
  status: fiscalStatusEnum().notNull(),
  receiptNo: text().notNull(),
  fiscalSign: text(),
  receiptUrl: text(),
  amount: bigint({ mode: 'number' }).notNull(),
  requestId: uuid().notNull().unique(),
  createdBy: uuid()
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});
