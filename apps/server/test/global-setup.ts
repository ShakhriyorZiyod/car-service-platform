import { createDatabase } from '../src/db/client';
import { runMigrations } from '../src/db/migrator';
import { testDatabaseUrl } from './helpers/test-database';

/** Brings the test database to the current schema once per run. */
export default async function setup(): Promise<void> {
  const database = createDatabase(testDatabaseUrl(), {
    maxConnections: 1,
    statementTimeoutMs: false,
  });
  try {
    await runMigrations(database.db);
  } finally {
    await database.close();
  }
}
