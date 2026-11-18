import type { OrderStatus } from '@cs/shared/vocabulary';
import { canTransition, type OrderActor } from './order-status';

/**
 * What the staff may do with an order now (docs/PLAN.md, sections 8, 9.1 and 10.4). The panel shows
 * exactly these buttons; each use case checks the same rule again.
 */

export interface StaffActions {
  canCall: boolean;
  canEditItems: boolean;
  canReschedule: boolean;
  canCancel: boolean;
  canNoShow: boolean;
}

/** "No show" only once the slot has begun: before that the client may still come. */
export function noShowAllowed(status: OrderStatus, startsAt: Date, now: Date): boolean {
  return status === 'confirmed' && now >= startsAt;
}

export interface HandoverActions {
  canDiscount: boolean;
  canPriceItems: boolean;
  canCheckout: boolean;
}

/**
 * The money side of an order (docs/PLAN.md, sections 8 and 11): a discount until the car is handed
 * over, a price for a zone "to be agreed" once the work began, and checkout when it is ready.
 */
export function handoverActions(input: {
  status: OrderStatus;
  /** Zones that count and have no price. */
  unpricedCount: number;
  /** The person may give discounts and take payment (`checkout.write`). */
  maySettle: boolean;
}): HandoverActions {
  const { status } = input;
  const open =
    status === 'new' ||
    status === 'confirmed' ||
    status === 'in_work' ||
    status === 'ready_for_pickup';
  return {
    canDiscount: input.maySettle && open,
    canPriceItems:
      (status === 'in_work' || status === 'ready_for_pickup') && input.unpricedCount > 0,
    canCheckout: input.maySettle && status === 'ready_for_pickup',
  };
}

export function staffActions(input: {
  status: OrderStatus;
  /** When the booked slot begins. */
  startsAt: Date;
  now: Date;
  /** The owner may do what the admin may not (cancel work in progress). */
  by: Extract<OrderActor, 'admin' | 'owner'>;
}): StaffActions {
  const { status, by } = input;
  // Zones and the time can change until the work starts (PLAN 9.1, 10.4).
  const beforeWork = status === 'new' || status === 'confirmed';
  return {
    canCall: status === 'new',
    canEditItems: beforeWork,
    canReschedule: beforeWork,
    canCancel: canTransition(status, 'cancelled', by),
    canNoShow: noShowAllowed(status, input.startsAt, input.now),
  };
}
