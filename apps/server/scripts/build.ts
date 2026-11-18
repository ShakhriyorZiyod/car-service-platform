/**
 * Production build: bundles src/main.ts and the workspace packages (which ship TypeScript
 * sources) into dist/. npm dependencies stay external and load from node_modules at runtime.
 */
import { readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = new URL('..', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8')) as {
  dependencies?: Record<string, string>;
};

const external = Object.keys(pkg.dependencies ?? {})
  .filter((name) => !name.startsWith('@cs/'))
  .flatMap((name) => [name, `${name}/*`]);

await rm(new URL('dist', root), { recursive: true, force: true });
await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: ['src/main.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  external,
  logLevel: 'info',
});
