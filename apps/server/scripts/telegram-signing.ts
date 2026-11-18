import { sign, signData } from '@tma.js/init-data-node';

/**
 * Data signed the way Telegram signs it, with @tma.js/init-data-node rather than the server's own
 * code, so tests check the server against an independent implementation. Development and tests
 * only.
 */

export interface DevTelegramUser {
  id: number;
  firstName: string;
  lastName?: string;
  languageCode?: string;
}

export function signInitData(user: DevTelegramUser, botToken: string, authDate: Date): string {
  return sign(
    {
      user: {
        id: user.id,
        first_name: user.firstName,
        ...(user.lastName && { last_name: user.lastName }),
        ...(user.languageCode && { language_code: user.languageCode }),
        allows_write_to_pm: true,
      },
    },
    botToken,
    authDate,
  );
}

/** What `requestContactComplete` returns as `raw` after a user shares their number. */
export function signContact(
  contact: { userId: number; phone: string; firstName: string },
  botToken: string,
  authDate: Date,
): string {
  const fields = {
    auth_date: String(Math.floor(authDate.getTime() / 1000)),
    contact: JSON.stringify({
      user_id: contact.userId,
      phone_number: contact.phone,
      first_name: contact.firstName,
    }),
  };
  const dataCheckString = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  return new URLSearchParams({ ...fields, hash: signData(dataCheckString, botToken) }).toString();
}
