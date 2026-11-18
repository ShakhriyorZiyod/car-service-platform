import { TASK_STATUSES } from '@cs/shared/vocabulary';
import { sql } from 'drizzle-orm';
import { check, index, integer, pgEnum, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, idColumn, instant, updatedAt } from './columns';
import { users } from './identity';
import { orders } from './orders';

/** Tables of the tasks module (docs/PLAN.md, section 7.10). Only this module writes them. */

export const taskStatusEnum = pgEnum('task_status', TASK_STATUSES);
export const taskDecisionEnum = pgEnum('task_decision', ['accepted', 'rework']);

/**
 * A job given to a master: one or several zones of an order (`order_items.task_id`). The attempt
 * the master is on is `rework_count + 1`.
 */
export const tasks = pgTable(
  'tasks',
  {
    id: idColumn(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id),
    masterId: uuid()
      .notNull()
      .references(() => users.id),
    assistantId: uuid().references(() => users.id),
    status: taskStatusEnum().notNull().default('assigned'),
    instruction: text().notNull().default(''),
    /** The norm of the zones added up, in working minutes: the master's timer runs against it. */
    normMinutes: integer().notNull(),
    startedAt: instant(),
    submittedAt: instant(),
    acceptedAt: instant(),
    reworkCount: integer().notNull().default(0),
    /** What the admin said when sending it back. */
    lastRemark: text(),
    createdBy: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('tasks_rework_count_not_negative', sql`${t.reworkCount} >= 0`),
    check('tasks_norm_positive', sql`${t.normMinutes} > 0`),
    index('tasks_master_status_idx').on(t.masterId, t.status),
    index('tasks_order_idx').on(t.orderId),
  ],
);

/** What a master handed in on one attempt, and what the admin decided. */
export const taskReports = pgTable(
  'task_reports',
  {
    id: idColumn(),
    taskId: uuid()
      .notNull()
      .references(() => tasks.id),
    attempt: integer().notNull(),
    comment: text().notNull().default(''),
    submittedAt: instant().notNull(),
    decision: taskDecisionEnum(),
    remark: text(),
    decidedBy: uuid().references(() => users.id),
    decidedAt: instant(),
  },
  (t) => [unique('task_reports_attempt_unique').on(t.taskId, t.attempt)],
);
