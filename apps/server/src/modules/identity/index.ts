/**
 * The identity module (docs/PLAN.md, section 4.2): users, roles, the Mini App's actor and part,
 * consent and verified phone numbers, staff sign-in with sessions and a second step, and the
 * owner's staff management.
 */
import type { PlatformDeps } from '../../platform/deps';
import type { AuditService } from '../audit';
import type { Outbox } from '../../platform/outbox';
import type { WorkshopService } from '../workshop';
import type { LoginCodeSender } from './app/ports';
import { createClientsWriter, type ClientsWriter } from './app/clients';
import { createStaffDirectory } from './app/directory';
import { createStaffService, type StaffService } from './app/staff';
import { createStaffAuthService, type StaffAuthService } from './app/staff-auth';
import { createTmaService, type TmaService } from './app/tma';

export interface IdentityDeps extends PlatformDeps {
  audit: AuditService;
  workshop: WorkshopService;
  outbox: Outbox;
  loginCodes: LoginCodeSender;
  botToken: string;
  initDataMaxAgeSeconds: number;
  adminUrl: string | null;
}

export interface IdentityService {
  tma: TmaService;
  auth: StaffAuthService;
  staff: StaffService;
  /** The staff's side of the clients: create, edit, erase, and the client's own deletion request. */
  clients: ClientsWriter;
}

export function createIdentityService(deps: IdentityDeps): IdentityService {
  return {
    tma: createTmaService({ ...deps, settings: deps.workshop.settings }),
    auth: createStaffAuthService(deps),
    staff: createStaffService(deps),
    clients: createClientsWriter({ ...deps, staff: createStaffDirectory() }),
  };
}

export type { LoginCodeSender } from './app/ports';
export type { ClientRecord, ClientsWriter } from './app/clients';
export type { StaffAuthService } from './app/staff-auth';
export type { StaffService } from './app/staff';
export type { TmaService } from './app/tma';
export { createStaffDirectory } from './app/directory';
export { permissionsOf } from './domain/roles';
export { startHandlers, type BotUi } from './bot/start';
export { authRoutes, staffAdminRoutes, tmaRoutes } from './http/routes';
