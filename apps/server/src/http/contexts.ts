import type { StaffActor, TmaActor } from '../platform/actors';
import type { GroupRoutes } from './route';

/**
 * What a handler knows about the request besides its validated input, per route group
 * (docs/PLAN.md, section 13). The group's authentication establishes it before any handler runs.
 */

export interface TmaContext {
  actor: TmaActor;
}

/** Signing in: no actor yet, but the session cookie can be read, set and cleared. */
export interface AuthContext {
  ip: string;
  userAgent: string | null;
  sessionToken: string | undefined;
  startSession(token: string): void;
  endSession(): void;
}

export interface AdminContext {
  actor: StaffActor;
  ip: string;
}

export type TmaRoutes = GroupRoutes<'tma', TmaContext>;
export type AuthRoutes = GroupRoutes<'auth', AuthContext>;
export type AdminRoutes = GroupRoutes<'admin', AdminContext>;
