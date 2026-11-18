import type { Lang } from '@cs/shared/i18n';
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

/** A master in the Mini App: someone holding the master role, who sees only their own tasks. */
export interface MasterActor {
  kind: 'master';
  userId: string;
  telegramId: number;
  lang: Lang;
  fullName: string;
}

/** A client in the Mini App: someone with no staff role who has given their consent. */
export interface ClientActor {
  kind: 'client';
  userId: string;
  telegramId: number;
  lang: Lang;
  fullName: string;
  /** The number Telegram verified; null until the client shares it. */
  phone: string | null;
}

/** The garage and booking need a phone number the workshop can call (docs/PLAN.md, section 4.7). */
export function requireVerifiedPhone(actor: ClientActor): void {
  if (actor.phone === null) throw new AppError('phone_required');
}
