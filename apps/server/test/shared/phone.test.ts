import {
  formatPhone,
  formatPhoneInput,
  normalizePhone,
  PHONE_PREFIX,
  phoneInputState,
} from '@cs/shared/format';
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

describe('formatPhoneInput: the panel phone field while a person types or pastes', () => {
  it.each([
    // Typing after the prefix the field starts with.
    ['+998 ', '+998 '],
    ['+998 9', '+998 9'],
    ['+998 90', '+998 90'],
    ['+998 901', '+998 90 1'],
    ['+998 90 1234', '+998 90 123 4'],
    ['+998 90 123 4567', '+998 90 123 45 67'],
    ['+998 90 123 45 678', '+998 90 123 45 67'], // a tenth digit is not taken
    // Backspace stops at the prefix.
    ['+998', '+998 '],
    ['+99', '+99'],
    // Pasted into the emptied field, in the ways people write it.
    ['901234567', '+998 90 123 45 67'],
    ['90 123 45 67', '+998 90 123 45 67'],
    ['998901234567', '+998 90 123 45 67'],
    ['+998901234567', '+998 90 123 45 67'],
    ['+998 (90) 123-45-67', '+998 90 123 45 67'],
    // Telegram's own form of a shared number, pasted after the prefix.
    ['+998 998901234567', '+998 90 123 45 67'],
    ['+998 +998 90 123 45 67', '+998 90 123 45 67'],
    // Nine digits are the local part even when they start with 998 ("99 812 34 56").
    ['998123456', '+998 99 812 34 56'],
    ['+998 998123456', '+998 99 812 34 56'],
    // Another country: "+" and its digits, at most 15.
    ['+7 916 123-45-67', '+79161234567'],
    ['+998 +7 916 123 45 67', '+79161234567'],
    ['+996 555 123 456', '+996555123456'],
    ['+1234567890123456789', '+123456789012345'],
    // An emptied field stays empty.
    ['', ''],
    ['abc', ''],
  ])('%j → %j', (typed, shown) => {
    expect(formatPhoneInput(typed)).toBe(shown);
  });

  it('shows a stored number as it was typed', () => {
    expect(formatPhoneInput('+998901234567')).toBe(formatPhone('+998901234567'));
    expect(formatPhoneInput('+79161234567')).toBe('+79161234567');
  });

  it('what it shows, once complete, is what the server stores', () => {
    for (const typed of ['901234567', '998901234567', '+998 (90) 123-45-67']) {
      expect(normalizePhone(formatPhoneInput(typed))).toBe('+998901234567');
    }
  });
});

describe('phoneInputState: the save waits for a complete number', () => {
  it.each([
    ['', 'empty'],
    [PHONE_PREFIX, 'empty'],
    ['+', 'empty'],
    ['+998 90 123 45 6', 'incomplete'],
    ['+998 90', 'incomplete'],
    ['+7916', 'incomplete'],
    ['+0123456789', 'incomplete'],
    ['+998 90 123 45 67', 'complete'],
    ['+79161234567', 'complete'],
  ] as const)('%j is %s', (text, state) => {
    expect(phoneInputState(text)).toBe(state);
  });
});
