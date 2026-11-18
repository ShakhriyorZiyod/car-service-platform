/**
 * What a failed write says about why (PostgreSQL error codes). Drizzle wraps the driver's error,
 * so the search walks down the `cause` chain.
 */

interface PgError {
  code?: unknown;
  constraint?: unknown;
}

function pgErrorWith(error: unknown, code: string): PgError | undefined {
  for (let current: unknown = error; current; current = (current as { cause?: unknown }).cause) {
    const candidate = current as PgError;
    if (candidate.code === code) return candidate;
  }
  return undefined;
}

/** The unique constraint a failed write ran into, if that is why it failed ('' if unnamed). */
export function violatedUniqueConstraint(error: unknown): string | undefined {
  const pg = pgErrorWith(error, '23505');
  if (!pg) return undefined;
  return typeof pg.constraint === 'string' ? pg.constraint : '';
}

/** True when the write named a row that does not exist (a foreign key violation). */
export function isMissingReference(error: unknown): boolean {
  return pgErrorWith(error, '23503') !== undefined;
}

/** True when the write overlaps something it may not (an EXCLUDE constraint, code 23P01). */
export function isExclusionViolation(error: unknown): boolean {
  return pgErrorWith(error, '23P01') !== undefined;
}
