import type { Api } from 'grammy';
import type { LoginCodeSender } from '../modules/identity';
import { isUnreachableChatError } from './delivery';
import { texts } from './texts';

/**
 * Sends the second-step code straight away rather than through a queue: the person waits for it
 * on the sign-in screen, and after five minutes it is worthless anyway.
 */
export function createLoginCodeSender(api: Api): LoginCodeSender {
  return {
    async send(to, code) {
      try {
        await api.sendMessage(to.telegramId, texts[to.lang].loginCode(code));
        return 'sent';
      } catch (error) {
        if (isUnreachableChatError(error)) return 'unreachable';
        throw error;
      }
    },
  };
}
