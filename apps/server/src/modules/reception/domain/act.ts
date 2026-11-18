import {
  PHOTO_SIDES,
  type ActStatus,
  type OrderStatus,
  type PhotoSide,
} from '@cs/shared/vocabulary';

/**
 * The reception act (docs/PLAN.md, sections 7.9 and 9.4): the record of the car's state when it is
 * taken in, which the client must agree to before the work starts. Pure rules.
 */

/** What an act still lacks before it can be sent. */
export type ActMissing = 'mileage' | 'fuel' | PhotoSide;

/** The mileage, the fuel level and a photo of each of the four sides (PLAN 9.4). */
export function missingForSend(input: {
  mileageKm: number | null;
  fuelLevel: number | null;
  photographedSides: readonly PhotoSide[];
}): ActMissing[] {
  return [
    ...(input.mileageKm === null ? (['mileage'] as const) : []),
    ...(input.fuelLevel === null ? (['fuel'] as const) : []),
    ...PHOTO_SIDES.filter((side) => !input.photographedSides.includes(side)),
  ];
}

export type ActActor = 'admin' | 'client';

interface Transition {
  from: ActStatus;
  to: ActStatus;
  by: ActActor;
}

/**
 * Sending, the client's word, the admin's note of a verbal agreement (also straight from a draft:
 * the client is at the counter), and taking a sent act back to change it.
 */
export const ACT_TRANSITIONS: readonly Transition[] = [
  { from: 'draft', to: 'sent', by: 'admin' },
  { from: 'sent', to: 'draft', by: 'admin' },
  { from: 'sent', to: 'confirmed', by: 'client' },
  { from: 'sent', to: 'confirmed', by: 'admin' },
  { from: 'draft', to: 'confirmed', by: 'admin' },
];

export const canActTransition = (from: ActStatus, to: ActStatus, by: ActActor): boolean =>
  ACT_TRANSITIONS.some((t) => t.from === from && t.to === to && t.by === by);

export interface ActActions {
  /** The car is here (order confirmed) and the act has not been signed: it may be changed. */
  canEdit: boolean;
  canSend: boolean;
  canConfirmVerbal: boolean;
  /** The act is confirmed and the order waits to be handed to the masters. */
  canStartWork: boolean;
}

/** What the admin may do with an order's act now. `status` is null while there is no act yet. */
export function actActions(input: {
  orderStatus: OrderStatus;
  status: ActStatus | null;
  missing: readonly ActMissing[];
}): ActActions {
  const { orderStatus, status, missing } = input;
  const canEdit = orderStatus === 'confirmed' && status !== 'confirmed';
  const complete = status !== null && missing.length === 0;
  return {
    canEdit,
    canSend: canEdit && status === 'draft' && complete,
    canConfirmVerbal: canEdit && complete,
    canStartWork: orderStatus === 'confirmed' && status === 'confirmed',
  };
}

/** The client may answer an act that was sent to them, while the order still waits for the work. */
export const canClientConfirm = (orderStatus: OrderStatus, status: ActStatus | null): boolean =>
  orderStatus === 'confirmed' && status === 'sent';
