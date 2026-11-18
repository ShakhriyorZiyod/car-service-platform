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

/** How the client paid at handover (docs/PLAN.md, sections 7.12 and 11). Online payment is v2. */
export const PAYMENT_METHODS = ['cash', 'card_terminal', 'transfer'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Who issued the fiscal receipt: in v1 the admin types the number from the cash register. */
export const FISCAL_PROVIDERS = ['manual'] as const;
export type FiscalProvider = (typeof FISCAL_PROVIDERS)[number];

/** v2 adds `pending` and `failed` for a cash register API that answers later. */
export const FISCAL_STATUSES = ['done'] as const;
export type FiscalStatus = (typeof FISCAL_STATUSES)[number];

/** A client's rating of finished work: one to five stars. */
export const RATINGS = [1, 2, 3, 4, 5] as const;
export type Rating = (typeof RATINGS)[number];
