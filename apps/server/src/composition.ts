/**
 * Wires the modules together (docs/PLAN.md, section 4.5). Each module gets exactly the services
 * it depends on; there is no container and no global state.
 */
import type { Db } from './db/client';
import type { Logger } from './logger';
import { createAuditService, type AuditService } from './modules/audit';
import {
  createIdentityService,
  type IdentityService,
  type LoginCodeSender,
} from './modules/identity';
import type { Clock } from './platform/clock';

export interface ServicesDeps {
  db: Db;
  clock: Clock;
  logger: Logger;
  botToken: string;
  /** How old Mini App init data may be (TZ 15.2: a day). */
  initDataMaxAgeSeconds: number;
  adminUrl: string | null;
  loginCodes: LoginCodeSender;
}

export interface Services {
  audit: AuditService;
  identity: IdentityService;
}

export const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;

export function createServices(deps: ServicesDeps): Services {
  const platform = { db: deps.db, clock: deps.clock, logger: deps.logger };
  const audit = createAuditService(platform);
  const identity = createIdentityService({
    ...platform,
    audit,
    loginCodes: deps.loginCodes,
    botToken: deps.botToken,
    initDataMaxAgeSeconds: deps.initDataMaxAgeSeconds,
    adminUrl: deps.adminUrl,
  });
  return { audit, identity };
}
