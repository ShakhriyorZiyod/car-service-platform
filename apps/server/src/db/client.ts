import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Logger } from '../logger';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

/** A transaction handle; it has the same query API as Db. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

const DEFAULT_CONNECTION_TIMEOUT_MS = 10_000;
const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;
const PING_TIMEOUT_MS = 2_000;

export interface Database {
  db: Db;
  pool: pg.Pool;
  /** True when the database answers within a moment; for /health. Safe to pass around. */
  readonly ping: () => Promise<boolean>;
  close(): Promise<void>;
}

export function createDatabase(
  url: string,
  options: {
    logger?: Logger;
    maxConnections?: number;
    /** How long a request waits for a free connection before it fails. */
    connectionTimeoutMs?: number;
    /** Migrations may rightly take longer than any request should. */
    statementTimeoutMs?: number | false;
  } = {},
): Database {
  // Without these limits, one stuck query or forgotten transaction would stop everything without
  // a word: the process stays alive, so nothing restarts it. A failed request is far better.
  const pool = new pg.Pool({
    connectionString: url,
    max: options.maxConnections ?? 10,
    connectionTimeoutMillis: options.connectionTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS,
    statement_timeout: options.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS,
    idle_in_transaction_session_timeout: DEFAULT_STATEMENT_TIMEOUT_MS,
  });
  // An idle client losing its connection must not crash the process.
  pool.on('error', (err) => options.logger?.error({ err }, 'postgres pool error'));

  const db = drizzle({ client: pool, schema, casing: 'snake_case' });

  async function ping(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), PING_TIMEOUT_MS);
    });
    const query = pool.query('select 1').then(
      () => true,
      () => false,
    );
    try {
      return await Promise.race([query, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  return { db, pool, ping, close: () => pool.end() };
}
