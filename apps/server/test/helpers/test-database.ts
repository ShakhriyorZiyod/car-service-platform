import { sql } from 'drizzle-orm';
import type { Db } from '../../src/db/client';

/** The test database URL; refuses anything whose name does not end with `_test`. */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (see .env.example)');
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to use "${name}" as a test database: the name must end with _test`);
  }
  return url;
}

/** Empties every table before a test; the migrations journal lives in its own schema. */
export async function resetDatabase(db: Db): Promise<void> {
  const { rows } = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  if (rows.length === 0) return;
  const tables = rows.map((row) => `"public"."${row.tablename}"`).join(', ');
  await db.execute(sql.raw(`truncate table ${tables} restart identity cascade`));
}
