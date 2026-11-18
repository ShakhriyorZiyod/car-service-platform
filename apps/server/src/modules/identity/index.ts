/**
 * The identity module (docs/PLAN.md, section 4.2): users, roles, the Mini App's actor and part,
 * consent and verified phone numbers, staff sign-in with sessions and a second step, and the
 * owner's staff management.
 */
import type { PlatformDeps } from '../../platform/deps';
import type { AuditService } from '../audit';
import type { LoginCodeSender } from './app/ports';
import { createStaffService, type StaffService } from './app/staff';
import { createStaffAuthService, type StaffAuthService } from './app/staff-auth';
import { createTmaService, type TmaService } from './app/tma';

export interface IdentityDeps extends PlatformDeps {
  audit: AuditService;
  loginCodes: LoginCodeSender;
  botToken: string;
  initDataMaxAgeSeconds: number;
  adminUrl: string | null;
}

export interface IdentityService {
  tma: TmaService;
  auth: StaffAuthService;
  staff: StaffService;
}

export function createIdentityService(deps: IdentityDeps): IdentityService {
  return {
    tma: createTmaService(deps),
    auth: createStaffAuthService(deps),
    staff: createStaffService(deps),
  };
}

export type { LoginCodeSender } from './app/ports';
export type { StaffAuthService } from './app/staff-auth';
export type { StaffService } from './app/staff';
export type { TmaService } from './app/tma';
export { startHandlers, type BotUi } from './bot/start';
export { authRoutes, staffAdminRoutes, tmaRoutes } from './http/routes';
