import type { Db } from '../db/client';
import type { Logger } from '../logger';
import type { Clock } from './clock';

/** What every module's use cases may touch. Adapters never receive this, only services. */
export interface PlatformDeps {
  db: Db;
  clock: Clock;
  logger: Logger;
}
