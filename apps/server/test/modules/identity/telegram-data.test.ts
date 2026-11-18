import { describe, expect, it } from 'vitest';
import { signContact, signInitData } from '../../../scripts/telegram-signing';
import { readContact, readInitData } from '../../../src/modules/identity/domain/telegram-data';

/** Signed by @tma.js/init-data-node, not by the code under test. */
const TOKEN = '1234567890:token-of-this-bot';
const OTHER_TOKEN = '1234567890:token-of-another-bot';
const DAY = 24 * 60 * 60;
const now = new Date('2026-10-29T05:00:00Z');
const secondsAgo = (s: number) => new Date(now.getTime() - s * 1000);

const user = { id: 42, firstName: 'Aziz', lastName: 'Karimov', languageCode: 'uz' };
const options = { botToken: TOKEN, now, maxAgeSeconds: DAY };

describe('readInitData: only data Telegram signed for this bot identifies a person', () => {
  it('reads a valid launch', () => {
    const result = readInitData(signInitData(user, TOKEN, secondsAgo(60)), options);
    expect(result).toEqual({
      ok: true,
      user: { telegramId: 42, firstName: 'Aziz', lastName: 'Karimov', languageCode: 'uz' },
    });
  });

  it('rejects data signed for another bot', () => {
    expect(readInitData(signInitData(user, OTHER_TOKEN, now), options)).toEqual({
      ok: false,
      reason: 'invalid_signature',
    });
  });

  it('rejects a changed user: someone else’s id under the same signature', () => {
    const raw = signInitData(user, TOKEN, now).replace(
      encodeURIComponent('"id":42'),
      encodeURIComponent('"id":43'),
    );
    expect(readInitData(raw, options)).toMatchObject({ ok: false, reason: 'invalid_signature' });
  });

  it('accepts data up to a day old and rejects older (TZ 15.2)', () => {
    expect(readInitData(signInitData(user, TOKEN, secondsAgo(DAY - 1)), options).ok).toBe(true);
    expect(readInitData(signInitData(user, TOKEN, secondsAgo(DAY + 1)), options)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('rejects data dated well into the future', () => {
    const future = new Date(now.getTime() + 10 * 60_000);
    expect(readInitData(signInitData(user, TOKEN, future), options)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it.each(['', 'user=%7B%7D', 'hash=abc', 'auth_date=1&hash=' + 'z'.repeat(64)])(
    'rejects malformed input %j',
    (raw) => {
      expect(readInitData(raw, options)).toMatchObject({ ok: false });
    },
  );
});

describe('readContact: a number is accepted only from Telegram, for the person who shares it', () => {
  const contact = { userId: 42, phone: '998901234567', firstName: 'Aziz' };
  const read = (raw: string, telegramId = 42) =>
    readContact(raw, { botToken: TOKEN, now, maxAgeSeconds: 3600, telegramId });

  it('reads the number in the stored form', () => {
    expect(read(signContact(contact, TOKEN, secondsAgo(10)))).toEqual({
      ok: true,
      phone: '+998901234567',
    });
  });

  it('keeps a foreign number', () => {
    expect(read(signContact({ ...contact, phone: '79161234567' }, TOKEN, now))).toEqual({
      ok: true,
      phone: '+79161234567',
    });
  });

  it('rejects a contact of another Telegram user', () => {
    expect(read(signContact({ ...contact, userId: 43 }, TOKEN, now))).toEqual({
      ok: false,
      reason: 'other_user',
    });
  });

  it('rejects a number changed after signing', () => {
    const raw = signContact(contact, TOKEN, now).replace('998901234567', '998909999999');
    expect(read(raw)).toEqual({ ok: false, reason: 'invalid_signature' });
  });

  it('rejects a contact signed for another bot, or older than an hour', () => {
    expect(read(signContact(contact, OTHER_TOKEN, now))).toMatchObject({
      reason: 'invalid_signature',
    });
    expect(read(signContact(contact, TOKEN, secondsAgo(3601)))).toMatchObject({
      reason: 'expired',
    });
  });

  it('rejects something that is not a phone number', () => {
    expect(read(signContact({ ...contact, phone: '12' }, TOKEN, now))).toEqual({
      ok: false,
      reason: 'bad_phone',
    });
  });

  it('rejects init data passed off as a contact', () => {
    expect(read(signInitData(user, TOKEN, now))).toEqual({ ok: false, reason: 'malformed' });
  });
});
