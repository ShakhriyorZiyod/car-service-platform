import type { AuditEntry } from '@cs/shared';
import { desc, eq, lt } from 'drizzle-orm';
import type { DbOrTx } from '../../../db/client';
import { auditLog, users } from '../../../db/schema';
import { presentInstant } from '../../../lib/time';
import { requirePermission, type StaffActor } from '../../../platform/actors';
import type { PlatformDeps } from '../../../platform/deps';

/** One change worth remembering (docs/PLAN.md, section 7.3). Never a password or a code. */
export interface AuditRecord {
  /** Null for the system or a command-line script. */
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

export interface AuditPage {
  items: AuditEntry[];
  nextCursor: string | null;
}

export interface AuditService {
  /** Written inside the caller's transaction: the change and its record commit together. */
  record(tx: DbOrTx, entry: AuditRecord): Promise<void>;
  /** Newest first; `cursor` is the last id of the previous page. */
  list(
    actor: StaffActor,
    query: { cursor?: string | undefined; limit: number },
  ): Promise<AuditPage>;
}

export function createAuditService(deps: Pick<PlatformDeps, 'db' | 'clock'>): AuditService {
  return {
    async record(tx, entry) {
      await tx.insert(auditLog).values({
        actorId: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        before: entry.before ?? null,
        after: entry.after ?? null,
        ip: entry.ip ?? null,
        at: deps.clock.now(),
      });
    },

    async list(actor, query) {
      requirePermission(actor, 'audit.read');
      const rows = await deps.db
        .select({
          id: auditLog.id,
          at: auditLog.at,
          action: auditLog.action,
          entity: auditLog.entity,
          entityId: auditLog.entityId,
          before: auditLog.before,
          after: auditLog.after,
          actorId: users.id,
          actorName: users.fullName,
        })
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.actorId))
        // UUID v7 ids grow with time, so the id is also the order.
        .where(query.cursor ? lt(auditLog.id, query.cursor) : undefined)
        .orderBy(desc(auditLog.id))
        .limit(query.limit + 1);

      const page = rows.slice(0, query.limit);
      return {
        items: page.map((row) => ({
          id: row.id,
          at: presentInstant(row.at),
          actor: row.actorId && row.actorName ? { id: row.actorId, fullName: row.actorName } : null,
          action: row.action,
          entity: row.entity,
          entityId: row.entityId,
          before: row.before,
          after: row.after,
        })),
        nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      };
    },
  };
}
