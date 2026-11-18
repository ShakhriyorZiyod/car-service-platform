import type { FileStore } from '../../src/platform/ports';

/** The file port over a map, so a test touches no disk. */
export function createMemoryFileStore(): FileStore & { size(): number; keys(): string[] } {
  const files = new Map<string, Buffer>();
  return {
    put: (key, bytes) => {
      files.set(key, Buffer.from(bytes));
      return Promise.resolve();
    },
    get: (key) => Promise.resolve(files.get(key) ?? null),
    delete: (key) => {
      files.delete(key);
      return Promise.resolve();
    },
    size: () => files.size,
    keys: () => [...files.keys()],
  };
}
