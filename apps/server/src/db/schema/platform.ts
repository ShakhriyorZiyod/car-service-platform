import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, idColumn, instant } from './columns';
import { users } from './identity';

/** Tables of the shared platform (docs/PLAN.md, sections 4.8 and 7.13). */

export const statusEntityEnum = pgEnum('status_entity', ['order', 'task']);

/**
 * Every change of status of an order or a task, in the transaction that made it (PLAN 2, rule 4).
 * The statuses are text: orders and tasks have different ones.
 */
export const statusHistory = pgTable(
  'status_history',
  {
    id: idColumn(),
    entity: statusEntityEnum().notNull(),
    entityId: uuid().notNull(),
    fromStatus: text(),
    toStatus: text().notNull(),
    /** Null for the system. */
    actorId: uuid().references(() => users.id),
    reasonId: uuid(),
    comment: text(),
    at: instant().notNull(),
  },
  (t) => [index('status_history_entity_idx').on(t.entity, t.entityId, t.at)],
);

export const outboxStatusEnum = pgEnum('outbox_status', ['pending', 'sent', 'skipped', 'dead']);

/**
 * Messages to other people, written in the transaction of the change they report and delivered
 * afterwards by the outbox worker. `payload` carries everything the text needs, as it was then.
 */
export const outbox = pgTable(
  'outbox',
  {
    id: idColumn(),
    recipientId: uuid()
      .notNull()
      .references(() => users.id),
    payload: jsonb().notNull(),
    /** The same key is written once: a retry of the whole use case does not message twice. */
    dedupeKey: text(),
    status: outboxStatusEnum().notNull().default('pending'),
    attempts: integer().notNull().default(0),
    nextAttemptAt: instant().notNull(),
    lastError: text(),
    sentAt: instant(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('outbox_dedupe_key_unique')
      .on(t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null`),
    index('outbox_due_idx')
      .on(t.nextAttemptAt)
      .where(sql`${t.status} = 'pending'`),
  ],
);
