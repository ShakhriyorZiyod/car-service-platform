import { GrammyError, HttpError } from 'grammy';

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
