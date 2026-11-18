import { randomBytes } from 'node:crypto';
import type { Config } from '../config';
import { createLocalFileStore } from './local-file-store';
import type { FileStore } from '../platform/ports';

/** The photo store and the secret that signs its links, from the configuration. */
export function storageDeps(config: Pick<Config, 'uploadsDir' | 'mediaUrlSecret'>): {
  files: FileStore;
  mediaSecret: string;
} {
  return {
    files: createLocalFileStore(config.uploadsDir),
    // Development only (production requires the setting): links from before a restart stop working.
    mediaSecret: config.mediaUrlSecret ?? randomBytes(32).toString('hex'),
  };
}
