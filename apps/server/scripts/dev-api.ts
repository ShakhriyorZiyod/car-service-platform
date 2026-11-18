/**
 * The HTTP API alone, without the bot: `npm run dev:api`. For working on the clients in a plain
 * browser; no Telegram needed. Pair it with `npm run dev:init-data` for the Mini App.
 *
 * Sign-in codes for directors and owners cannot reach Telegram here, so they are printed to this
 * terminal instead. That happens only in this development script, never in the service logs.
 */
import { createServices } from '../src/composition';
import { loadConfig } from '../src/config';
import { createDatabase } from '../src/db/client';
import { createHttpApp } from '../src/http/app';
import { startHttpServer } from '../src/http/server';
import { startScheduler } from '../src/jobs/scheduler';
import { createLogger } from '../src/logger';
import { systemClock } from '../src/platform/clock';
import { storageDeps } from '../src/storage';
import { devBotToken } from './dev-token';

const config = loadConfig();
if (config.env === 'production') throw new Error('dev:api must not run in production');

const logger = createLogger({ level: config.logLevel, pretty: true });
const database = createDatabase(config.databaseUrl, { logger });
const services = createServices({
  db: database.db,
  clock: systemClock,
  logger,
  botToken: devBotToken(config),
  // Signed once by dev:init-data, used for a month.
  initDataMaxAgeSeconds: 30 * 24 * 60 * 60,
  adminUrl: config.urls?.admin ?? 'http://localhost:5174/admin/',
  loginCodes: {
    send(to, code) {
      console.log(`\n[dev:api] sign-in code for Telegram user ${to.telegramId}: ${code}\n`);
      return Promise.resolve('sent');
    },
  },
  ...storageDeps(config),
});

// Held orders are cancelled on time here too; there is no bot, so no message leaves the outbox.
startScheduler({ tasks: services.tasks, clock: systemClock, logger });

await startHttpServer(
  createHttpApp({
    logger,
    services,
    checkDatabase: database.ping,
    validateResponses: true,
    cookieSecure: config.cookieSecure,
  }),
  config.http,
  logger,
);
