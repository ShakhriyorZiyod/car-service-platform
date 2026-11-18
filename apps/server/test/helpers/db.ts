import { afterAll, beforeEach } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client';
import { resetDatabase, testDatabaseUrl } from './test-database';

/** Opens the test database for the current file and empties it before every test. */
export function useTestDatabase(options: { maxConnections?: number } = {}): Database {
  const database = createDatabase(testDatabaseUrl(), { maxConnections: 5, ...options });
  beforeEach(() => resetDatabase(database.db));
  afterAll(() => database.close());
  return database;
}
