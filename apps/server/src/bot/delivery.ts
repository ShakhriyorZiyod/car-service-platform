import { GrammyError, HttpError, InlineKeyboard, type Api } from 'grammy';
import type { MessageSender } from '../jobs/outbox-worker';

const BAD_REQUEST = 400;
const FORBIDDEN = 403;

/**
 * Telegram refuses this chat until the user writes to the bot first: they blocked it, or never
 * opened it. The second case answers 400 "chat not found", not 403.
 */
export function isUnreachableChatError(error: unknown): boolean {
  if (!(error instanceof GrammyError)) return false;
  if (error.error_code === FORBIDDEN) return true;
  return error.error_code === BAD_REQUEST && /chat not found/i.test(error.description);
}

/** Safe for logs: Telegram's description or the error class, never the message text. */
export function describeDeliveryError(error: unknown): string {
  if (error instanceof GrammyError) return `telegram ${error.error_code}: ${error.description}`;
  if (error instanceof HttpError) return `network: ${error.message}`;
  return error instanceof Error ? error.name : 'unknown error';
}

/** Sends outbox messages: the text, and a button that opens the Mini App or the panel. */
export function createMessageSender(
  api: Api,
  urls: { miniApp: string | undefined; admin: string | undefined },
): MessageSender {
  return {
    async send(chatId, message) {
      const keyboard = new InlineKeyboard();
      // Answers in the chat come first, each on its own row; the link opens the screen.
      for (const action of message.actions ?? []) {
        keyboard.text(action.text, action.data);
        if (!message.actionsInRow) keyboard.row();
      }
      if (message.actionsInRow) keyboard.row();
      const button = message.button;
      if (button) {
        if (button.target === 'panel') {
          // Inside Telegram, on the order's own page; staff messages go to private chats, where
          // web_app buttons are allowed. Telegram Web opens it in a frame, where the panel only
          // offers a new tab (apps/admin/src/main.tsx).
          if (urls.admin) {
            const page = button.orderId ? `${urls.admin}orders/${button.orderId}` : urls.admin;
            keyboard.webApp(button.text, page);
          }
        } else if (urls.miniApp) {
          const query =
            button.target === 'task' ? `?task=${button.taskId}` : `?order=${button.orderId}`;
          keyboard.webApp(button.text, `${urls.miniApp}${query}`);
        }
      }
      const hasButtons = keyboard.inline_keyboard.some((row) => row.length > 0);
      try {
        await api.sendMessage(chatId, message.text, hasButtons ? { reply_markup: keyboard } : {});
        return 'sent';
      } catch (error) {
        if (isUnreachableChatError(error)) return 'unreachable';
        throw error;
      }
    },
  };
}
