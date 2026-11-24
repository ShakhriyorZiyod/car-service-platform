/**
 * Production build: bundles src/main.ts and the workspace packages (which ship TypeScript
 * sources) into dist/. npm dependencies stay external and load from node_modules at runtime.
 * dist/migrate.js applies the migrations on the server itself, with the server's own environment
 * (docs/DEPLOY.md), so the database password never leaves it.
 */
import { cp, readFile, rm } from 'node:fs/promises';
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
  entryPoints: { main: 'src/main.ts', migrate: 'src/db/migrate.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  external,
  logLevel: 'info',
});

// The migrator reads the SQL files next to itself (`./migrations`), so they ship with the build.
await cp(new URL('src/db/migrations', root), new URL('dist/migrations', root), { recursive: true });
