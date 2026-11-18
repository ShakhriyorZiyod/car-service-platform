import { describe, expect, it } from 'vitest';
import {
  isAcceptablePassword,
  normalizeLogin,
  parseIdentifier,
} from '../../../src/modules/identity/domain/credentials';
import {
  challengeState,
  isSessionAlive,
  isSignInLocked,
  resendWaitSeconds,
  shouldTouchSession,
  SIGN_IN_RULES,
} from '../../../src/modules/identity/domain/sign-in';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const now = new Date('2026-10-29T05:00:00Z');
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);

describe('logins and identifiers', () => {
  it.each([
    ['dilfuza.s', 'dilfuza.s'],
    ['  Dilfuza.S ', 'dilfuza.s'],
    ['owner_1', 'owner_1'],
    ['a-b', 'a-b'],
  ])('%j is the login %j', (input, login) => {
    expect(normalizeLogin(input)).toBe(login);
  });

  it.each(['ab', '.owner', 'with space', 'имя', '12345', 'a'.repeat(33), ''])(
    '%j is not a login',
    (input) => {
      expect(normalizeLogin(input)).toBeNull();
    },
  );

  it('a phone number signs in too, and a login is never read as a phone', () => {
    expect(parseIdentifier('+998 90 123 45 67')).toEqual({ kind: 'phone', phone: '+998901234567' });
    expect(parseIdentifier('901234567')).toEqual({ kind: 'phone', phone: '+998901234567' });
    expect(parseIdentifier('dilfuza.s')).toEqual({ kind: 'login', login: 'dilfuza.s' });
    expect(parseIdentifier('!!')).toBeNull();
  });

  it.each([
    ['12345678', true],
    ['correct horse battery', true],
    ['1234567', false],
    ['        ', false],
    ['x'.repeat(129), false],
  ])('password %j acceptable: %s', (password, ok) => {
    expect(isAcceptablePassword(password)).toBe(ok);
  });
});

describe('wrong passwords pause signing in (10 in 15 minutes, TZ 15.2)', () => {
  it.each([
    [0, false],
    [9, false],
    [10, true],
    [25, true],
  ])('%s failures in the window: locked %s', (failures, locked) => {
    expect(isSignInLocked(failures)).toBe(locked);
  });
});

describe('a second-step code', () => {
  const created = { expiresAt: at(SIGN_IN_RULES.codeTtlMs), attempts: 0, consumedAt: null };

  it('lives five minutes', () => {
    expect(challengeState(created, at(5 * MIN - 1))).toBe('active');
    expect(challengeState(created, at(5 * MIN))).toBe('expired');
  });

  it('allows five tries', () => {
    expect(challengeState({ ...created, attempts: 4 }, now)).toBe('active');
    expect(challengeState({ ...created, attempts: 5 }, now)).toBe('exhausted');
  });

  it('works once', () => {
    expect(challengeState({ ...created, consumedAt: now }, now)).toBe('consumed');
  });

  it('a new one is sent at most once a minute', () => {
    expect(resendWaitSeconds(null, now)).toBe(0);
    expect(resendWaitSeconds(at(-1000), now)).toBe(59);
    expect(resendWaitSeconds(at(-59_001), now)).toBe(1);
    expect(resendWaitSeconds(at(-MIN), now)).toBe(0);
  });
});

describe('a panel session', () => {
  const session = (lastSeenAgo: number, createdAgo: number) => ({
    lastSeenAt: at(-lastSeenAgo),
    expiresAt: at(SIGN_IN_RULES.sessionMaxMs - createdAgo),
  });

  it('ends after 12 hours unused', () => {
    expect(isSessionAlive(session(12 * HOUR - 1, HOUR), now)).toBe(true);
    expect(isSessionAlive(session(12 * HOUR, HOUR), now)).toBe(false);
  });

  it('ends after 30 days however much it is used', () => {
    expect(isSessionAlive(session(0, 30 * DAY - 1), now)).toBe(true);
    expect(isSessionAlive(session(0, 30 * DAY), now)).toBe(false);
  });

  it('records use at most every five minutes', () => {
    expect(shouldTouchSession(at(-5 * MIN + 1), now)).toBe(false);
    expect(shouldTouchSession(at(-5 * MIN), now)).toBe(true);
  });
});
