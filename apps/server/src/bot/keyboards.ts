import { InlineKeyboard } from 'grammy';

/** A button that opens the Mini App; none when no public URL is configured yet. */
export function openAppKeyboard(
  miniAppUrl: string | undefined,
  label: string,
): InlineKeyboard | undefined {
  return miniAppUrl ? new InlineKeyboard().webApp(label, miniAppUrl) : undefined;
}
