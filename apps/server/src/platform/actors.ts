import type { Permission, Role } from '@cs/shared/vocabulary';
import { AppError } from './errors';

/**
 * Who is asking. The identity module establishes an actor once per request (init data or session
 * cookie); every use case then checks what this actor may do (docs/PLAN.md, section 8).
 */

/** Someone in the Mini App, identified by signed Telegram init data. */
export interface TmaActor {
  kind: 'tma';
  userId: string;
  telegramId: number;
  /** Effective roles: empty when staff access is blocked. */
  roles: readonly Role[];
}

/** A staff member in the web panel, identified by a session. */
export interface StaffActor {
  kind: 'staff';
  userId: string;
  roles: readonly Role[];
  permissions: ReadonlySet<Permission>;
}

export function requirePermission(actor: StaffActor, permission: Permission): void {
  if (!actor.permissions.has(permission)) throw new AppError('forbidden', `missing ${permission}`);
}
