import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { idColumn, instant } from './columns';
import { users } from './identity';

/**
 * Who changed what (docs/PLAN.md, section 7.3). Append-only: a trigger refuses UPDATE and DELETE
 * (migration 0002). Ids are UUID v7, so ordering by id is ordering by time.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: idColumn(),
    /** Null for the system or a command-line script. */
    actorId: uuid().references(() => users.id),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: text(),
    before: jsonb(),
    after: jsonb(),
    ip: text(),
    at: instant().notNull(),
  },
  (t) => [index('audit_log_entity_idx').on(t.entity, t.entityId)],
);
