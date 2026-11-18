import { createHmac, timingSafeEqual } from 'node:crypto';
import { normalizePhone } from '@cs/shared/format';
import { z } from 'zod';

/**
 * Data Telegram signs for a Mini App: the init data of every launch and the contact a user shares.
 * Both are query strings whose `hash` is an HMAC-SHA256 keyed by the bot token
 * (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app). Only data
 * that passes here identifies a person (docs/PLAN.md, sections 2 and 7.2).
 */

export type SignatureFailure = 'malformed' | 'invalid_signature' | 'expired';

interface VerifyOptions {
  botToken: string;
  now: Date;
  maxAgeSeconds: number;
}

/** Clocks differ a little; data dated further ahead than this is not trusted. */
const MAX_CLOCK_SKEW_SECONDS = 300;

const HASH = /^[0-9a-f]{64}$/;

function verifySignature(
  raw: string,
  options: VerifyOptions,
): { ok: true; params: URLSearchParams } | { ok: false; reason: SignatureFailure } {
  const params = new URLSearchParams(raw);
  const hash = params.get('hash');
  if (!hash || !HASH.test(hash)) return { ok: false, reason: 'malformed' };
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(options.botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) {
    return { ok: false, reason: 'invalid_signature' };
  }

  const authDate = Number(params.get('auth_date'));
  if (!Number.isInteger(authDate) || authDate <= 0) return { ok: false, reason: 'malformed' };
  const ageSeconds = options.now.getTime() / 1000 - authDate;
  if (ageSeconds < -MAX_CLOCK_SKEW_SECONDS) return { ok: false, reason: 'malformed' };
  if (ageSeconds > options.maxAgeSeconds) return { ok: false, reason: 'expired' };

  return { ok: true, params };
}

function parseJson(value: string | null): unknown {
  if (value === null) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

const telegramUserSchema = z.object({
  id: z.number().int().positive(),
  first_name: z.string(),
  last_name: z.string().optional(),
  language_code: z.string().optional(),
});

export interface TelegramUser {
  telegramId: number;
  firstName: string;
  lastName: string | undefined;
  languageCode: string | undefined;
}

/** A Mini App launch: who opened it. */
export function readInitData(
  raw: string,
  options: VerifyOptions,
): { ok: true; user: TelegramUser } | { ok: false; reason: SignatureFailure } {
  const verified = verifySignature(raw, options);
  if (!verified.ok) return verified;
  const user = telegramUserSchema.safeParse(parseJson(verified.params.get('user')));
  if (!user.success) return { ok: false, reason: 'malformed' };
  return {
    ok: true,
    user: {
      telegramId: user.data.id,
      firstName: user.data.first_name,
      lastName: user.data.last_name,
      languageCode: user.data.language_code,
    },
  };
}

const contactSchema = z.object({
  user_id: z.number().int().positive(),
  phone_number: z.string(),
});

export type ContactFailure = SignatureFailure | 'other_user' | 'bad_phone';

/**
 * A shared contact, accepted only for the user who shared it: Telegram also lets people send
 * someone else's contact, and that must not link this account to that number.
 */
export function readContact(
  raw: string,
  options: VerifyOptions & { telegramId: number },
): { ok: true; phone: string } | { ok: false; reason: ContactFailure } {
  const verified = verifySignature(raw, options);
  if (!verified.ok) return verified;
  const contact = contactSchema.safeParse(parseJson(verified.params.get('contact')));
  if (!contact.success) return { ok: false, reason: 'malformed' };
  if (contact.data.user_id !== options.telegramId) return { ok: false, reason: 'other_user' };

  // Telegram sends the number without "+": "998901234567".
  const digits = contact.data.phone_number.trim();
  const phone = normalizePhone(digits.startsWith('+') ? digits : `+${digits}`);
  return phone ? { ok: true, phone } : { ok: false, reason: 'bad_phone' };
}
