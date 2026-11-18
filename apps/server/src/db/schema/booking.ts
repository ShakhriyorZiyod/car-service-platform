import { BOOKING_KINDS } from '@cs/shared/vocabulary';
import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, idColumn, instant } from './columns';
import { users } from './identity';
import { orders } from './orders';
import { boxes } from './workshop';

/**
 * Tables of the booking module (docs/PLAN.md, section 7.7). Only this module writes them.
 * The `bookings_no_overlap` EXCLUDE constraint is in its own SQL migration: Drizzle cannot say it.
 */

export const bookingKindEnum = pgEnum('booking_kind', BOOKING_KINDS);

/** A box held for an order, or blocked for something else, over one stretch of time. */
export const bookings = pgTable(
  'bookings',
  {
    id: idColumn(),
    kind: bookingKindEnum().notNull(),
    orderId: uuid().references(() => orders.id),
    boxId: uuid()
      .notNull()
      .references(() => boxes.id),
    startsAt: instant().notNull(),
    endsAt: instant().notNull(),
    /** Set when the box is given back: the stretch then no longer holds it. */
    releasedAt: instant(),
    releaseReason: text(),
    /** Why a block exists. */
    note: text(),
    createdBy: uuid().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    check('bookings_ends_after_start', sql`${t.endsAt} > ${t.startsAt}`),
    check('bookings_order_iff_kind_order', sql`(${t.kind} = 'order') = (${t.orderId} is not null)`),
    uniqueIndex('bookings_one_active_per_order')
      .on(t.orderId)
      .where(sql`${t.releasedAt} is null and ${t.kind} = 'order'`),
    index('bookings_box_time_idx').on(t.boxId, t.startsAt),
  ],
);
