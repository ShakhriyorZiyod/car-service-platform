import { formatPhone, normalizePhone } from '@cs/shared/format';
import { describe, expect, it } from 'vitest';

describe('normalizePhone: one stored form, +998XXXXXXXXX', () => {
  it.each([
    ['901234567', '+998901234567'],
    ['90 123 45 67', '+998901234567'],
    ['998901234567', '+998901234567'],
    ['+998901234567', '+998901234567'],
    ['+998 (90) 123-45-67', '+998901234567'],
    ['  +998 90 123 45 67  ', '+998901234567'],
    // Foreign numbers are kept when written with their country code.
    ['+79161234567', '+79161234567'],
    ['+7 916 123-45-67', '+79161234567'],
  ])('%j → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    '',
    '12345',
    '90123456', // eight digits
    '9012345678', // ten digits without a country code
    '+99890123456', // an Uzbek number one digit short
    '+9989012345678', // and one digit too long
    '+0123456789',
    '90 123 45 6a',
    '+998 90 123 45 67 ext 1',
  ])('rejects %j', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe('formatPhone: +998 XX XXX XX XX (TZ 15.6)', () => {
  it('splits an Uzbek number', () => {
    expect(formatPhone('+998901234567')).toBe('+998 90 123 45 67');
  });

  it('shows a foreign number as it is', () => {
    expect(formatPhone('+79161234567')).toBe('+79161234567');
  });
});
