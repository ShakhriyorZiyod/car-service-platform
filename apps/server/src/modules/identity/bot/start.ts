import { Composer, type Context } from 'grammy';
import { openAppKeyboard } from '../../../bot/keyboards';
import { escapeHtml, texts } from '../../../bot/texts';
import type { TmaService } from '../app/tma';
import type { TelegramUser } from '../domain/telegram-data';

export interface BotUi {
  miniAppUrl: string | undefined;
}

const telegramUserOf = (from: NonNullable<Context['from']>): TelegramUser => ({
  telegramId: from.id,
  firstName: from.first_name,
  lastName: from.last_name,
  languageCode: from.language_code,
});

/**
 * The bot is an entry point and a message channel: /start and any message lead to the Mini App,
 * which decides by role what to open (docs/PLAN.md, section 4.7). /start also records that the
 * bot may write to this person, which the second sign-in step and later notifications rely on.
 */
export function startHandlers(tma: TmaService, ui: BotUi): Composer<Context> {
  const composer = new Composer<Context>();
  const privateChat = composer.chatType('private');

  privateChat.command('start', async (ctx) => {
    const lang = await tma.recordBotStart(telegramUserOf(ctx.from));
    const tx = texts[lang];
    await ctx.reply(ui.miniAppUrl ? tx.welcome(escapeHtml(ctx.from.first_name)) : tx.appNotReady, {
      reply_markup: openAppKeyboard(ui.miniAppUrl, tx.openApp),
    });
  });

  privateChat.on('message', async (ctx) => {
    const lang = await tma.recordBotStart(telegramUserOf(ctx.from));
    const tx = texts[lang];
    await ctx.reply(ui.miniAppUrl ? tx.fallback : tx.appNotReady, {
      reply_markup: openAppKeyboard(ui.miniAppUrl, tx.openApp),
    });
  });

  // Blocking and unblocking the bot: whether it may write to this person.
  composer.on('my_chat_member', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    const status = ctx.myChatMember.new_chat_member.status;
    await tma.setBotAccess(ctx.myChatMember.from.id, status === 'kicked' ? 'blocked' : 'allowed');
  });

  return composer;
}
