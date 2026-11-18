/**
 * Words of orders and bookings (docs/PLAN.md, sections 7.7–7.8 and 9.1). The database enums repeat
 * these values.
 */

export const ORDER_STATUSES = [
  'new',
  'confirmed',
  'in_work',
  'ready_for_pickup',
  'completed',
  'cancelled',
  'no_show',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Where an order came from. A client in the Mini App is `tma`. */
export const ORDER_SOURCES = ['tma', 'phone', 'walk_in', 'instagram', 'other'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

/** `booked` was chosen when the order was made, `extra` was added to it later (stage 5). */
export const ORDER_ITEM_KINDS = ['booked', 'extra'] as const;
export type OrderItemKind = (typeof ORDER_ITEM_KINDS)[number];

export const ITEM_APPROVALS = ['not_required', 'pending', 'approved', 'rejected'] as const;
export type ItemApproval = (typeof ITEM_APPROVALS)[number];

export const APPROVAL_CHANNELS = ['tma', 'bot', 'phone'] as const;
export type ApprovalChannel = (typeof APPROVAL_CHANNELS)[number];

export const CALL_OUTCOMES = ['confirmed', 'no_answer', 'rejected'] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

/** What a booking row holds a box for. */
export const BOOKING_KINDS = ['order', 'block'] as const;
export type BookingKind = (typeof BOOKING_KINDS)[number];

/** Which tab of "My orders" an order is on. */
export const ORDER_TABS = ['active', 'history'] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

/** Orders that still take up the workshop's time or wait for the client. */
export const ACTIVE_ORDER_STATUSES = [
  'new',
  'confirmed',
  'in_work',
  'ready_for_pickup',
] as const satisfies readonly OrderStatus[];

/** The filters of the clients list (design A10). */
export const CLIENT_FILTERS = ['all', 'regular', 'lapsed', 'no_telegram'] as const;
export type ClientFilter = (typeof CLIENT_FILTERS)[number];
