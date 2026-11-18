import type { OrderStatus } from '@cs/shared/vocabulary';

/**
 * The order's life (docs/PLAN.md, section 9.1). Status changes only along these lines, by the
 * people named, and the use case that makes one also writes it to the history.
 */

/** Who makes a change: the client, an admin, the owner, or the system on its own. */
export type OrderActor = 'client' | 'admin' | 'owner' | 'system';

interface Transition {
  from: OrderStatus;
  to: OrderStatus;
  by: readonly OrderActor[];
}

export const ORDER_TRANSITIONS: readonly Transition[] = [
  { from: 'new', to: 'confirmed', by: ['admin', 'owner'] },
  { from: 'new', to: 'cancelled', by: ['client', 'admin', 'owner', 'system'] },
  { from: 'confirmed', to: 'cancelled', by: ['client', 'admin', 'owner'] },
  { from: 'confirmed', to: 'no_show', by: ['admin', 'owner'] },
  { from: 'confirmed', to: 'in_work', by: ['admin', 'owner'] },
  { from: 'in_work', to: 'ready_for_pickup', by: ['system'] },
  { from: 'in_work', to: 'cancelled', by: ['owner'] },
  { from: 'ready_for_pickup', to: 'completed', by: ['admin', 'owner'] },
];

export function canTransition(from: OrderStatus, to: OrderStatus, by: OrderActor): boolean {
  return ORDER_TRANSITIONS.some(
    (transition) => transition.from === from && transition.to === to && transition.by.includes(by),
  );
}

export interface ClientActions {
  canCancel: boolean;
  canRequestReschedule: boolean;
}

/**
 * What the client may do with their order now (PLAN 8): cancel until the work starts, and ask the
 * workshop to move the time while it is still ahead, once.
 */
export function clientActions(order: {
  status: OrderStatus;
  rescheduleRequested: boolean;
}): ClientActions {
  return {
    canCancel: canTransition(order.status, 'cancelled', 'client'),
    canRequestReschedule:
      (order.status === 'new' || order.status === 'confirmed') && !order.rescheduleRequested,
  };
}
