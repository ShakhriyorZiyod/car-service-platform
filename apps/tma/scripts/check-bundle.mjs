/**
 * Enforces the speed budget of docs/PLAN.md (section 3.2). Run after `npm run build`.
 *
 * - What a person downloads on first open is the entry chunk plus the chunk of their part of the
 *   app (client, master or staff); each of these totals must stay within the budget.
 * - Every part is its own lazy chunk, so nobody downloads another role's code.
 * - The number font stays small.
 */
import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 200;
const FONT_BUDGET_KB = 24;
const SHELLS = ['client', 'master', 'staff'];
const FORBIDDEN_IN_BUNDLE = ['VITE_DEV_INIT_DATA', 'VITE_DEV_CONTACT'];

const dist = new URL('../dist/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('.vite/manifest.json', dist), 'utf8'));
const chunks = Object.values(manifest);

const kb = (bytes) => (bytes / 1024).toFixed(1).padStart(7);
const gzipped = (file) => gzipSync(readFileSync(new URL(file, dist))).length;

/** A chunk and everything it imports statically, with their CSS. */
function closure(chunk, into = new Set()) {
  if (into.has(chunk)) return into;
  into.add(chunk);
  for (const key of chunk.imports ?? []) closure(manifest[key], into);
  return into;
}

function sizeOf(set) {
  let total = 0;
  for (const chunk of set) {
    total += gzipped(chunk.file);
    for (const css of chunk.css ?? []) total += gzipped(css);
  }
  return total;
}

const failures = [];

const entry = chunks.find((chunk) => chunk.isEntry);
if (!entry) throw new Error('No entry chunk in the manifest: did the build run?');
const initial = closure(entry);
const initialSize = sizeOf(initial);
console.log(`First open, before a part is chosen: ${kb(initialSize)} KB gzip`);

for (const shell of SHELLS) {
  const chunk = chunks.find((c) => c.src?.includes(`src/shells/${shell}/`));
  if (!chunk || !chunk.isDynamicEntry || initial.has(chunk)) {
    failures.push(`the ${shell} part must be a lazy chunk of its own`);
    continue;
  }
  const own = [...closure(chunk)].filter((c) => !initial.has(c));
  const total = initialSize + sizeOf(own);
  console.log(`First open as ${shell.padEnd(6)}: ${kb(total)} KB gzip (budget ${BUDGET_KB})`);
  if (total > BUDGET_KB * 1024) failures.push(`${shell}: first open is over ${BUDGET_KB} KB`);

  for (const other of SHELLS.filter((name) => name !== shell)) {
    if (own.some((c) => c.src?.includes(`src/shells/${other}/`))) {
      failures.push(`${shell} loads the code of ${other}`);
    }
  }
}

const fonts = new Set(
  chunks.flatMap((chunk) => chunk.assets ?? []).filter((f) => f.endsWith('.woff2')),
);
for (const font of fonts) {
  const size = statSync(new URL(font, dist)).size;
  console.log(`Font ${font}: ${kb(size)} KB (budget ${FONT_BUDGET_KB})`);
  if (size > FONT_BUDGET_KB * 1024) failures.push(`${font} is over ${FONT_BUDGET_KB} KB`);
}

for (const chunk of chunks) {
  if (!chunk.file.endsWith('.js')) continue;
  const code = readFileSync(new URL(chunk.file, dist), 'utf8');
  for (const word of FORBIDDEN_IN_BUNDLE) {
    if (code.includes(word)) failures.push(`${chunk.file} contains ${word}`);
  }
}

if (failures.length > 0) {
  console.error(`\nFAILED:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nOK');
