import type { Role } from '@cs/shared/vocabulary';
import { describe, expect, it } from 'vitest';
import { decidePhoneLink } from '../../../src/modules/identity/domain/phone-link';
import { credentialProblem, keepsAnOwner } from '../../../src/modules/identity/domain/staff';

const PHONE = '+998901234567';
const OTHER = '+998907654321';

describe('decidePhoneLink: where a Telegram-verified number goes (PLAN 7.2)', () => {
  const fresh = { id: 'u', phone: null };

  it.each([
    ['nobody has it', fresh, null, { kind: 'set' }],
    [
      'the user already has it',
      { id: 'u', phone: PHONE },
      { id: 'u', telegramId: 1 },
      { kind: 'unchanged' },
    ],
    [
      'a row without Telegram has it: staff added by the owner, a client entered by phone',
      fresh,
      { id: 'o', telegramId: null },
      { kind: 'merge', intoUserId: 'o' },
    ],
    ['another Telegram account has it', fresh, { id: 'o', telegramId: 2 }, { kind: 'taken' }],
    [
      'the user already has another number and history: not merged',
      { id: 'u', phone: OTHER },
      { id: 'o', telegramId: null },
      { kind: 'taken' },
    ],
    ['the user changes to a free number', { id: 'u', phone: OTHER }, null, { kind: 'set' }],
  ] as const)('%s', (_case, user, holder, decision) => {
    expect(decidePhoneLink(user, holder, PHONE)).toEqual(decision);
  });
});

describe('credentialProblem: panel roles sign in with a login, masters without one', () => {
  it.each<[Role[], string | null, boolean | undefined, string | null]>([
    [['admin'], 'dilfuza', true, null],
    [['admin'], null, true, 'login_required'],
    [['owner'], 'owner', false, 'password_required'],
    [['master'], null, false, null],
    [['master'], 'odil', false, 'login_not_allowed'],
    [['master'], null, true, 'password_not_allowed'],
    [['master', 'admin'], 'odil', true, null],
    // An update does not carry a password; it is set on its own.
    [['director'], 'kamola', undefined, null],
  ])('%j, login %j, password given %s → %s', (roles, login, passwordGiven, problem) => {
    expect(
      credentialProblem({ roles, login, ...(passwordGiven !== undefined && { passwordGiven }) }),
    ).toBe(problem);
  });
});

describe('keepsAnOwner: the workshop always keeps an owner who can sign in', () => {
  it.each([
    [[{ roles: ['owner'], isBlocked: false }], true],
    [[{ roles: ['owner'], isBlocked: true }], false],
    [[{ roles: ['admin'], isBlocked: false }], false],
    [
      [
        { roles: ['owner'], isBlocked: true },
        { roles: ['owner', 'admin'], isBlocked: false },
      ],
      true,
    ],
    [[], false],
  ] as const)('%j → %s', (owners, keeps) => {
    expect(keepsAnOwner(owners)).toBe(keeps);
  });
});
