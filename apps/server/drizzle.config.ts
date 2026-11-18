import { defineConfig } from 'drizzle-kit';

// Only used by `npm run db:generate`: it compares the schema with the migration snapshots and
// never connects to a database.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  casing: 'snake_case',
  strict: true,
});
