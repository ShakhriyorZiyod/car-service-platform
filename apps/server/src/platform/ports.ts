import type { Lang } from '@cs/shared/i18n';
import type { Role } from '@cs/shared/vocabulary';
import type { DbOrTx } from '../db/client';

/** Who a message goes to. */
export interface Recipient {
  userId: string;
  lang: Lang;
}

/**
 * The staff, for messages "to the admins": identity knows who they are, and the modules that write
 * messages only ask.
 */
export interface StaffDirectory {
  /** Active staff holding any of these roles who can be reached in Telegram. */
  recipients(tx: DbOrTx, roles: readonly Role[]): Promise<Recipient[]>;
}

/**
 * Something the system does by itself when the time comes (docs/PLAN.md, section 4.8). It works
 * out what to do from the state of the data, so running it twice is harmless. The scheduler runs
 * it; a module defines it.
 */
export interface ScheduledTask {
  name: string;
  run(now: Date): Promise<void>;
}

/**
 * Where the photos' files lie (docs/PLAN.md, section 4.9). The media module owns the rows that say
 * what each file is; the store only keeps bytes under a random key.
 */
export interface FileStore {
  put(key: string, bytes: Uint8Array): Promise<void>;
  /** The bytes, or null when there is no such file. */
  get(key: string): Promise<Buffer | null>;
  /** Removing a file that is not there is not an error. */
  delete(key: string): Promise<void>;
}
