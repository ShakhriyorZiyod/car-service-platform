import type { Role } from '@cs/shared/vocabulary';
import { canUsePanel } from './roles';

/** Rules of managing staff (docs/PLAN.md, section 8; design A13). */

export type CredentialProblem =
  'login_required' | 'login_not_allowed' | 'password_required' | 'password_not_allowed';

/**
 * Panel roles sign in with a login; masters work in the Mini App and have neither a login nor a
 * password. A new panel member also needs a first password, so that they can sign in at all.
 */
export function credentialProblem(input: {
  roles: readonly Role[];
  login: string | null;
  /** For a new staff member: whether a password was given. Undefined for an update. */
  passwordGiven?: boolean;
}): CredentialProblem | null {
  const panel = canUsePanel(input.roles);
  if (panel && !input.login) return 'login_required';
  if (!panel && input.login) return 'login_not_allowed';
  if (panel && input.passwordGiven === false) return 'password_required';
  if (!panel && input.passwordGiven === true) return 'password_not_allowed';
  return null;
}

/** The workshop must always keep at least one owner who can sign in. */
export function keepsAnOwner(
  owners: readonly { roles: readonly Role[]; isBlocked: boolean }[],
): boolean {
  return owners.some((owner) => !owner.isBlocked && owner.roles.includes('owner'));
}
