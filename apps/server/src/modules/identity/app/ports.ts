import type { Lang } from '@cs/shared/i18n';

/**
 * What the identity use cases need from the outside world. The bot implements it in production;
 * tests and dev:api pass their own.
 */
export interface LoginCodeSender {
  /** `unreachable`: Telegram refuses the chat (the bot is blocked or was never started). */
  send(to: { telegramId: number; lang: Lang }, code: string): Promise<'sent' | 'unreachable'>;
}
