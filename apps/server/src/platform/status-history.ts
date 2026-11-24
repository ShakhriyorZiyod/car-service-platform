import type { DbOrTx } from '../db/client';
import { statusHistory } from '../db/schema';

/** One step of an order's or a task's life (docs/PLAN.md, sections 2 and 7.8). */
export interface StatusStep {
  entity: 'order' | 'task' | 'shop_order';
  entityId: string;
  /** Null for the first status. */
  from: string | null;
  to: string;
  /** Null for the system. */
  actorId: string | null;
  reasonId?: string | null;
  comment?: string | null;
  at: Date;
}

/** Written in the transaction of the change, never alone. */
export async function recordStatus(tx: DbOrTx, step: StatusStep): Promise<void> {
  await tx.insert(statusHistory).values({
    entity: step.entity,
    entityId: step.entityId,
    fromStatus: step.from,
    toStatus: step.to,
    actorId: step.actorId,
    reasonId: step.reasonId ?? null,
    comment: step.comment ?? null,
    at: step.at,
  });
}
