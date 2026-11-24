/**
 * Error codes of the API: `{ error: { code } }`. Clients turn a code into a message; the server
 * maps it to an HTTP status (docs/PLAN.md, section 4.5). Business codes are added by the stage
 * that introduces the rule.
 */
export const API_ERROR_CODES = [
  'unauthorized',
  'forbidden',
  'not_found',
  'validation',
  'rate_limited',
  'internal',

  // Stage 1: signing in and identity
  /** Wrong login or password; never says which. */
  'invalid_credentials',
  /** Too many wrong passwords: signing in is paused for this login. */
  'login_locked',
  /** The second step is required, but the bot cannot reach this person's Telegram. */
  'two_factor_unavailable',
  /** The code is wrong. */
  'invalid_code',
  /** The code expired, was used, or ran out of attempts: sign in again. */
  'code_expired',
  /** The personal data consent has not been given yet. */
  'consent_required',
  /** The shared contact is not a valid one signed by Telegram for this user. */
  'invalid_contact',
  /** The phone number already belongs to another account. */
  'phone_taken',
  /** The login already belongs to another staff member. */
  'login_taken',
  /** The change would leave the workshop without an active owner. */
  'last_owner',

  // Stage 2: reference data
  /** A brand, a model of the brand or a service type with this name or code already exists. */
  'name_taken',

  // Stage 3: garage, booking and orders
  /** The client has no verified phone number yet: the garage and booking need one. */
  'phone_required',
  /** Another car of this client already has this plate. */
  'plate_taken',
  /** The car cannot be archived or changed while it has an order in progress. */
  'car_has_active_orders',
  /** The zones chosen are not all offered for this car, or contradict each other. */
  'service_unavailable',
  /** The start time is not one the workshop offers (outside the horizon, too soon, off the grid). */
  'slot_unavailable',
  /** Somebody took the time first: every box that could do the job is held. */
  'slot_taken',
  /** The order is not in a state where this can be done. */
  'invalid_transition',

  // Stage 5: reception, tasks and photos
  /** The act cannot be sent yet: the mileage, the fuel or a side's photo is missing. */
  'act_incomplete',
  /** The work cannot start: the client has not confirmed the act. */
  'act_not_confirmed',
  /** The file is not a JPEG, PNG or WebP picture, or is too big. */
  'invalid_photo',
  /** The report needs at least one photo of the work done. */
  'photo_required',
  /** A zone is already in another task, or is not yet approved by the client. */
  'item_unavailable',
  /** The extra work was already answered, or the order already rated. */
  'already_decided',

  // Stage 6: handover and payment
  /** A zone that counts has no price yet: it must be priced before the car is handed over. */
  'unpriced_items',
  /** The payments do not add up to the order's total. */
  'payment_mismatch',
  /** The discount is above the admin's limit: only the owner may give more. */
  'discount_over_limit',

  // Stage 8: the warehouse
  /** Another product already has this article or barcode. */
  'sku_taken',
  'barcode_taken',
  /** There is not enough free stock: what is reserved for orders cannot be written off. */
  'insufficient_stock',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
