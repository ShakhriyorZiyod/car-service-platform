import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { FileStore } from '../platform/ports';

/** Keys are random UUIDs made by the media module; anything else never reaches the disk. */
const KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Photos on the server's disk (docs/PLAN.md, section 4.9). A file is written beside its place and
 * moved into it, so a reader never sees half a photo. Folders are the first two characters of the
 * key, so none of them grows huge.
 */
export function createLocalFileStore(directory: string): FileStore {
  const pathOf = (key: string): string => {
    if (!KEY_PATTERN.test(key)) throw new Error('invalid file key');
    return join(directory, key.slice(0, 2), key);
  };

  return {
    async put(key, bytes) {
      const target = pathOf(key);
      await mkdir(dirname(target), { recursive: true });
      const partial = `${target}.part`;
      await writeFile(partial, bytes);
      await rename(partial, target);
    },

    async get(key) {
      try {
        return await readFile(pathOf(key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },

    async delete(key) {
      await rm(pathOf(key), { force: true });
    },
  };
}
