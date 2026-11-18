/**
 * Applies pending migrations: `npm run db:migrate`. Uses the drizzle-orm migrator, so
 * drizzle-kit is not needed where it runs.
 */
import { loadConfig } from '../config';
import { createLogger } from '../logger';
import { createDatabase } from './client';
import { runMigrations } from './migrator';

const config = loadConfig();
const logger = createLogger({ level: config.logLevel, pretty: config.env === 'development' });
const database = createDatabase(config.databaseUrl, {
  logger,
  maxConnections: 1,
  statementTimeoutMs: false,
});

try {
  await runMigrations(database.db);
  logger.info('migrations applied');
} catch (err) {
  logger.error({ err }, 'migration failed');
  process.exitCode = 1;
} finally {
  await database.close();
}
