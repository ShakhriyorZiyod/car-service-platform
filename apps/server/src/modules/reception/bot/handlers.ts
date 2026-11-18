import { Composer, type Context } from 'grammy';
import { answerClientAction, type ClientLookup } from '../../../bot/actions';
import type { ReceptionService } from '../app/reception';

/** "Tasdiqlayman" under the act message: the client confirms in the chat (docs/PLAN.md, 12). */
export function receptionBotHandlers(
  reception: ReceptionService,
  clients: ClientLookup,
): Composer<Context> {
  const composer = new Composer<Context>();
  composer.callbackQuery(/^act:ok:([0-9a-f-]{36})$/, async (ctx) => {
    const orderId = ctx.match[1];
    if (!orderId) return;
    await answerClientAction(
      ctx,
      clients,
      async (client) => {
        await reception.confirmByClient(client, orderId, 'bot');
      },
      (words) => words.actConfirmed,
    );
  });
  return composer;
}
