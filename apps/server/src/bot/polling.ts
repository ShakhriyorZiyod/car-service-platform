import { run, type RunnerHandle } from '@grammyjs/runner';
import type { Bot } from 'grammy';

const ALLOWED_UPDATES = ['message', 'callback_query', 'my_chat_member'] as const;

/**
 * Long polling with concurrent update processing. Only one instance may poll: Telegram answers
 * 409 Conflict to the second one, and `onConflict` is called.
 */
export function startPolling(bot: Bot, onConflict: () => void): RunnerHandle {
  bot.api.config.use(async (prev, method, payload, signal) => {
    const response = await prev(method, payload, signal);
    if (method === 'getUpdates' && !response.ok && response.error_code === 409) onConflict();
    return response;
  });

  return run(bot, { runner: { fetch: { allowed_updates: ALLOWED_UPDATES } } });
}
