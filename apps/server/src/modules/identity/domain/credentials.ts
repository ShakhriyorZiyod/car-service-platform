import { normalizePhone } from '@cs/shared/format';
import { LIMITS } from '@cs/shared/vocabulary';

/** How staff identify themselves in the panel (docs/PLAN.md, section 8; design A0). */

/**
 * Latin letters, digits, dot, dash and underscore; starts with a letter or digit; lower-case; at
 * least one letter, so a login can never be mistaken for a phone number.
 */
const LOGIN = new RegExp(
  `^(?=.*[a-z])[a-z0-9][a-z0-9._-]{${LIMITS.login.min - 1},${LIMITS.login.max - 1}}$`,
);

/** "Dilfuza.S " → "dilfuza.s"; null when it cannot be a login. */
export function normalizeLogin(input: string): string | null {
  const login = input.trim().toLowerCase();
  return LOGIN.test(login) ? login : null;
}

/** The sign-in form takes a login or a phone number ("Login yoki telefon"). */
export type SignInIdentifier = { kind: 'login'; login: string } | { kind: 'phone'; phone: string };

export function parseIdentifier(input: string): SignInIdentifier | null {
  const phone = normalizePhone(input);
  if (phone) return { kind: 'phone', phone };
  const login = normalizeLogin(input);
  return login ? { kind: 'login', login } : null;
}

/** Long enough to resist guessing; length is the only rule, so a passphrase works. */
export function isAcceptablePassword(password: string): boolean {
  const length = [...password].length;
  return (
    length >= LIMITS.password.min && length <= LIMITS.password.max && password.trim().length > 0
  );
}
