import { Composer, type Context } from 'grammy';
import { answerClientAction, type ClientLookup } from '../../../bot/actions';
import type { ExtrasService } from '../app/extras';

/** "Roziman" and "Kerak emas" under the extra work message (docs/PLAN.md, 9.3 and 12). */
export function extrasBotHandlers(extras: ExtrasService, clients: ClientLookup): Composer<Context> {
  const composer = new Composer<Context>();
  composer.callbackQuery(/^extra:(yes|no):([0-9a-f-]{36})$/, async (ctx) => {
    const [, answer, itemId] = ctx.match;
    if (!itemId) return;
    const approved = answer === 'yes';
    await answerClientAction(
      ctx,
      clients,
      async (client) => {
        await extras.decideAsClient(client, itemId, approved ? 'approved' : 'rejected', 'bot');
      },
      (words) => (approved ? words.extraApproved : words.extraRejected),
    );
  });
  return composer;
}
