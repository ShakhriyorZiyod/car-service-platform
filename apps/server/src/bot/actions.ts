import { DEFAULT_LANG, langFromCode } from '@cs/shared/i18n';
import type { Context } from 'grammy';
import type { ClientActor } from '../platform/actors';
import { isAppError } from '../platform/errors';
import { texts, type BotTexts } from './texts';

/**
 * Buttons that answer in the chat (docs/PLAN.md, section 12): "Tasdiqlayman", "Roziman". The id in
 * the button's data is never trusted: the use case checks that it belongs to this client.
 */

/** Finds the client behind a Telegram account; the identity module answers. */
export interface ClientLookup {
  clientByTelegramId(telegramId: number): Promise<ClientActor | null>;
}

/** Answers the press and takes the answering buttons off the message, keeping the links. */
export async function answerClientAction(
  ctx: Context,
  clients: ClientLookup,
  run: (client: ClientActor) => Promise<void>,
  success: (words: BotTexts) => string,
): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  const fallback = texts[langFromCode(from.language_code) ?? DEFAULT_LANG];
  const client = await clients.clientByTelegramId(from.id);
  if (!client) {
    await ctx.answerCallbackQuery({ text: fallback.notFound, show_alert: true });
    return;
  }
  const words = texts[client.lang];
  try {
    await run(client);
  } catch (error) {
    if (isAppError(error)) {
      const text =
        error.code === 'already_decided'
          ? words.alreadyAnswered
          : error.code === 'not_found'
            ? words.notFound
            : error.code === 'invalid_transition'
              ? words.notAvailable
              : null;
      if (text) {
        await ctx.answerCallbackQuery({ text, show_alert: true });
        return;
      }
    }
    throw error;
  }
  await ctx.answerCallbackQuery({ text: success(words) });
  // The answer is given: the buttons that asked for it go, the link to the order stays.
  try {
    const rows = ctx.callbackQuery?.message?.reply_markup?.inline_keyboard ?? [];
    await ctx.editMessageReplyMarkup({
      reply_markup: {
        inline_keyboard: rows.filter((row) => !row.some((button) => 'callback_data' in button)),
      },
    });
  } catch {
    // An old message that can no longer be edited: the answer itself is already recorded.
  }
}
