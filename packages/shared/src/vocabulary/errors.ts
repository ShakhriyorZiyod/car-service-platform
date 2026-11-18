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
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
