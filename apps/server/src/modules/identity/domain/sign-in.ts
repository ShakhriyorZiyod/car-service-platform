/**
 * Rules of signing in to the panel (TZ 15.2, docs/PLAN.md section 15). Pure functions of their
 * inputs and `now`, so the tests can walk through time.
 */

export const SIGN_IN_RULES = {
  /** Wrong passwords allowed within the window before signing in pauses. */
  failureLimit: 10,
  failureWindowMs: 15 * 60_000,
  /** A second-step code: how long it lives and how many tries it allows. */
  codeTtlMs: 5 * 60_000,
  codeMaxAttempts: 5,
  /** A new code is sent at most this often. */
  codeResendMs: 60_000,
  /** A session ends after this long without use, and in any case after the maximum. */
  sessionIdleMs: 12 * 3_600_000,
  sessionMaxMs: 30 * 86_400_000,
  /** How often the last-seen time of a session is written. */
  sessionTouchMs: 5 * 60_000,
} as const;

/** Failures after this instant count; one exactly fifteen minutes old no longer does. */
export const failureWindowStart = (now: Date): Date =>
  new Date(now.getTime() - SIGN_IN_RULES.failureWindowMs);

/** Paused once the limit is reached, even for the right password, until old failures age out. */
export const isSignInLocked = (failuresInWindow: number): boolean =>
  failuresInWindow >= SIGN_IN_RULES.failureLimit;

export type ChallengeState = 'active' | 'consumed' | 'expired' | 'exhausted';

export function challengeState(
  challenge: { expiresAt: Date; attempts: number; consumedAt: Date | null },
  now: Date,
): ChallengeState {
  if (challenge.consumedAt) return 'consumed';
  if (challenge.attempts >= SIGN_IN_RULES.codeMaxAttempts) return 'exhausted';
  if (now.getTime() >= challenge.expiresAt.getTime()) return 'expired';
  return 'active';
}

export const challengeExpiry = (now: Date): Date =>
  new Date(now.getTime() + SIGN_IN_RULES.codeTtlMs);

/** Seconds until another code may be sent; 0 when it may be sent now. */
export function resendWaitSeconds(lastCodeAt: Date | null, now: Date): number {
  if (!lastCodeAt) return 0;
  const waitMs = lastCodeAt.getTime() + SIGN_IN_RULES.codeResendMs - now.getTime();
  return waitMs > 0 ? Math.ceil(waitMs / 1000) : 0;
}

export const sessionExpiry = (now: Date): Date =>
  new Date(now.getTime() + SIGN_IN_RULES.sessionMaxMs);

export function isSessionAlive(session: { lastSeenAt: Date; expiresAt: Date }, now: Date): boolean {
  const t = now.getTime();
  return (
    t < session.expiresAt.getTime() &&
    t - session.lastSeenAt.getTime() < SIGN_IN_RULES.sessionIdleMs
  );
}

/** Writing the last-seen time on every request would cost a write per request for nothing. */
export const shouldTouchSession = (lastSeenAt: Date, now: Date): boolean =>
  now.getTime() - lastSeenAt.getTime() >= SIGN_IN_RULES.sessionTouchMs;
