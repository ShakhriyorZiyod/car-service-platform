import type { Config } from '../src/config';

/**
 * The token that signs and checks init data in development. With no real bot configured, a fixed
 * made-up one: dev:init-data signs with it and dev:api checks with it, and Telegram never sees it.
 */
const MADE_UP_TOKEN = '1234567890:development-only-token-not-a-real-bot';

export function devBotToken(config: Config): string {
  return config.telegram.botToken ?? MADE_UP_TOKEN;
}
