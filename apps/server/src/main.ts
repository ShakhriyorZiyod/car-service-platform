/**
 * One process runs the bot (long polling) and the HTTP API (docs/PLAN.md, section 4.1). Only one
 * instance may run at a time.
 */
import { createBot, installBotHandlers, publishMenuButton } from './bot/bot';
import { createMessageSender } from './bot/delivery';
import { createLoginCodeSender } from './bot/login-codes';
import { startPolling } from './bot/polling';
import { createServices, INIT_DATA_MAX_AGE_SECONDS } from './composition';
import { extrasBotHandlers, reviewBotHandlers } from './modules/orders';
import { receptionBotHandlers } from './modules/reception';
import { storageDeps } from './storage';
import { ConfigError, loadConfig, requireBotRuntime } from './config';
import { createDatabase } from './db/client';
import { createHttpApp } from './http/app';
import { startHttpServer } from './http/server';
import { startLoop } from './jobs/loop';
import { createOutboxWorker } from './jobs/outbox-worker';
import { startScheduler } from './jobs/scheduler';
import { createLogger } from './logger';
import { systemClock } from './platform/clock';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel, pretty: config.env === 'development' });
  const { botToken } = requireBotRuntime(config);

  const database = createDatabase(config.databaseUrl, { logger });
  const miniAppUrl = config.urls?.miniApp;
  if (!miniAppUrl) logger.warn('PUBLIC_URL is not set: the bot has no button to open the app');

  const bot = createBot({ token: botToken, logger });
  const services = createServices({
    db: database.db,
    clock: systemClock,
    logger,
    botToken,
    initDataMaxAgeSeconds: INIT_DATA_MAX_AGE_SECONDS,
    adminUrl: config.urls?.admin ?? null,
    loginCodes: createLoginCodeSender(bot.api),
    ...storageDeps(config),
  });
  installBotHandlers(bot, {
    tma: services.identity.tma,
    ui: { miniAppUrl },
    actions: [
      receptionBotHandlers(services.reception, services.identity.tma),
      extrasBotHandlers(services.extras, services.identity.tma),
      reviewBotHandlers(services.orders, services.identity.tma),
    ],
  });

  // Waits for as long as Telegram cannot be reached, so say what it is waiting for.
  logger.info('connecting to Telegram');
  await bot.init();
  if (miniAppUrl) await publishMenuButton(bot.api, miniAppUrl);

  const http = await startHttpServer(
    createHttpApp({
      logger,
      services,
      checkDatabase: database.ping,
      validateResponses: config.env !== 'production',
      cookieSecure: config.cookieSecure,
    }),
    config.http,
    logger,
  );

  // Messages to people are delivered from the outbox; timed work (cancelling held orders) runs
  // once a minute. Both only start once the bot is connected.
  const worker = createOutboxWorker({
    db: database.db,
    clock: systemClock,
    logger,
    sender: createMessageSender(bot.api, { miniApp: miniAppUrl, admin: config.urls?.admin }),
    markUnreachable: (telegramId) => services.identity.tma.setBotAccess(telegramId, 'blocked'),
  });
  const outboxLoop = startLoop({
    name: 'outbox',
    intervalMs: 2_000,
    logger,
    run: () => worker.runOnce(),
  });
  const scheduler = startScheduler({ tasks: services.tasks, clock: systemClock, logger });

  let stopping = false;
  const shutdown = async (reason: string, exitCode = 0) => {
    if (stopping) return;
    stopping = true;
    logger.info({ reason }, 'shutting down');
    try {
      if (runner.isRunning()) await runner.stop();
      await outboxLoop.stop();
      await scheduler.stop();
      await http.close();
      await database.close();
    } catch (err) {
      logger.error({ err }, 'shutdown failed');
      exitCode = 1;
    }
    process.exit(exitCode);
  };

  const runner = startPolling(bot, () => {
    logger.fatal('another instance is polling this bot (409 Conflict)');
    void shutdown('polling conflict', 1);
  });
  logger.info({ bot: bot.botInfo.username }, 'bot started');

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error(err instanceof ConfigError ? err.message : err);
  process.exit(1);
});
