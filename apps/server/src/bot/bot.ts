import { autoRetry } from '@grammyjs/auto-retry';
import { sequentialize } from '@grammyjs/runner';
import { DEFAULT_LANG, langFromCode } from '@cs/shared/i18n';
import { Bot, type Api, type ApiClientOptions, type BotError, type Context } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import type { Logger } from '../logger';
import { startHandlers, type BotUi, type TmaService } from '../modules/identity';
import { texts } from './texts';

export interface BotDeps {
  token: string;
  logger: Logger;
  /** Pass in tests to skip the getMe call. */
  botInfo?: UserFromGetMe;
  /** Pass in tests to replace the network. */
  client?: ApiClientOptions;
}

const HTML_METHODS = new Set(['sendMessage', 'editMessageText']);

/**
 * The bot without its handlers: services need `bot.api` to send messages, and the handlers need
 * the services, so the two are joined in installBotHandlers.
 */
export function createBot(deps: BotDeps): Bot {
  const bot = new Bot(deps.token, {
    ...(deps.botInfo && { botInfo: deps.botInfo }),
    ...(deps.client && { client: deps.client }),
  });

  // The limits are for Telegram's own answers (429, 5xx). Network failures are retried without
  // end, on purpose: a message waits out an outage instead of being lost.
  bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 60 }));
  // Every text is HTML (texts.ts); dynamic values are escaped where they are inserted.
  bot.api.config.use((prev, method, payload, signal) =>
    HTML_METHODS.has(method) && payload && !('parse_mode' in payload)
      ? prev(method, { ...payload, parse_mode: 'HTML' }, signal)
      : prev(method, payload, signal),
  );

  bot.catch((error) => handleBotError(error, deps.logger));
  return bot;
}

export function installBotHandlers(bot: Bot, deps: { tma: TmaService; ui: BotUi }): void {
  // Updates run concurrently, but updates from the same chat stay in order.
  bot.use(sequentialize((ctx: Context) => ctx.chat?.id.toString()));
  bot.use(startHandlers(deps.tma, deps.ui));

  // Buttons of old messages that no handler recognises: stop the loading spinner.
  bot.on('callback_query', (ctx) => ctx.answerCallbackQuery());
}

/** Makes the bot's menu button open the Mini App, for every chat. */
export async function publishMenuButton(api: Api, miniAppUrl: string): Promise<void> {
  await api.setChatMenuButton({
    menu_button: {
      type: 'web_app',
      text: texts[DEFAULT_LANG].openApp,
      web_app: { url: miniAppUrl },
    },
  });
}

async function handleBotError(error: BotError, logger: Logger): Promise<void> {
  const { ctx } = error;
  logger.error({ err: error.error, updateId: ctx.update.update_id }, 'bot update failed');

  const message = texts[langFromCode(ctx.from?.language_code)].errorGeneric;
  try {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: message, show_alert: true });
    else if (ctx.chat?.type === 'private') await ctx.reply(message);
  } catch (replyError) {
    logger.warn({ err: replyError }, 'could not report the error to the user');
  }
}
