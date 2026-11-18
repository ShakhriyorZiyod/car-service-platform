import type { Role } from '@cs/shared/vocabulary';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { sessions, users } from '../../../src/db/schema';
import type { SignInResult } from '../../../src/modules/identity/app/staff-auth';
import { useTestDatabase } from '../../helpers/db';
import { insertStaff, STAFF_PASSWORD } from '../../helpers/factories';
import { createTestServices, type TestContext } from '../../helpers/services';

const database = useTestDatabase();
let t: TestContext;
beforeEach(() => {
  t = createTestServices(database.db);
});

const MIN = 60_000;
const HOUR = 60 * MIN;
const auth = () => t.services.identity.auth;
const request = { ip: '127.0.0.1', userAgent: 'test' };

const signIn = (identifier: string, password = STAFF_PASSWORD) =>
  auth().signIn({ identifier, password, ...request });

async function staffWith(roles: Role[], overrides: Parameters<typeof insertStaff>[2] = {}) {
  const user = await insertStaff(database.db, roles, overrides);
  if (!user.login) throw new Error('panel staff need a login');
  return { ...user, login: user.login };
}

function sessionOf(result: SignInResult) {
  if (result.kind !== 'signed_in') throw new Error(`expected a session, got ${result.kind}`);
  return result;
}

function challengeOf(result: SignInResult) {
  if (result.kind !== 'code_sent') throw new Error(`expected a code, got ${result.kind}`);
  return result;
}

describe('password', () => {
  it('an admin signs in with login or phone and gets a session', async () => {
    const admin = await staffWith(['admin']);
    const byLogin = sessionOf(await signIn(admin.login.toUpperCase()));
    expect(byLogin.me).toMatchObject({ id: admin.id, roles: ['admin'] });
    expect(byLogin.me.permissions).toContain('orders.write');
    sessionOf(await signIn(admin.phone ?? ''));
  });

  it('a wrong password and an unknown login get the same answer', async () => {
    const admin = await staffWith(['admin']);
    await expect(signIn(admin.login, 'wrong password')).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
    await expect(signIn('nobody.here')).rejects.toMatchObject({ code: 'invalid_credentials' });
  });

  it('the password is stored with Argon2id', async () => {
    const admin = await staffWith(['admin']);
    expect(admin.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('masters and blocked staff do not get into the panel', async () => {
    const master = await staffWith(['master'], { login: 'odil.usta' });
    await expect(signIn(master.login)).rejects.toMatchObject({ code: 'forbidden' });
    const blocked = await staffWith(['admin'], { isBlocked: true });
    await expect(signIn(blocked.login)).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('ten wrong passwords in fifteen minutes pause signing in (TZ 15.2)', () => {
  it('then even the right password waits, by login or by phone', async () => {
    const admin = await staffWith(['admin']);
    for (let i = 0; i < 10; i += 1) {
      await expect(
        signIn(i % 2 ? admin.login : (admin.phone ?? ''), 'wrong'),
      ).rejects.toMatchObject({
        code: 'invalid_credentials',
      });
    }
    await expect(signIn(admin.login)).rejects.toMatchObject({ code: 'login_locked' });
    await expect(signIn(admin.phone ?? '')).rejects.toMatchObject({ code: 'login_locked' });

    t.clock.advance(15 * MIN);
    sessionOf(await signIn(admin.login));
  });

  it('a successful sign-in clears the count', async () => {
    const admin = await staffWith(['admin']);
    for (let i = 0; i < 9; i += 1) await expect(signIn(admin.login, 'wrong')).rejects.toThrow();
    sessionOf(await signIn(admin.login));
    for (let i = 0; i < 9; i += 1) await expect(signIn(admin.login, 'wrong')).rejects.toThrow();
    sessionOf(await signIn(admin.login));
  });
});

describe('the second step for directors and owners', () => {
  it('sends a code by the bot instead of a session', async () => {
    const owner = await staffWith(['owner']);
    const challenge = challengeOf(await signIn(owner.login));
    expect(challenge).toMatchObject({ expiresInSec: 300, resendAfterSec: 60 });
    expect(t.loginCodes.lastCodeFor(owner.telegramId ?? 0)).toMatch(/^\d{6}$/);
    expect(await database.db.select().from(sessions)).toHaveLength(0);
  });

  it('the right code opens a session', async () => {
    const director = await staffWith(['director']);
    const { challengeId } = challengeOf(await signIn(director.login));
    const code = t.loginCodes.lastCodeFor(director.telegramId ?? 0) ?? '';
    const { me } = await auth().verifyCode({ challengeId, code, ...request });
    expect(me).toMatchObject({ id: director.id, roles: ['director'] });
  });

  it('is impossible without a linked Telegram account', async () => {
    const owner = await staffWith(['owner'], { telegramId: null });
    await expect(signIn(owner.login)).rejects.toMatchObject({ code: 'two_factor_unavailable' });
  });

  it('when the bot cannot reach the owner, says so and remembers it', async () => {
    const owner = await staffWith(['owner']);
    t.loginCodes.unreachable.add(owner.telegramId ?? 0);
    await expect(signIn(owner.login)).rejects.toMatchObject({ code: 'two_factor_unavailable' });
    const [row] = await database.db.select().from(users).where(eq(users.id, owner.id));
    expect(row?.botAccess).toBe('blocked');
    // The failed delivery does not hold back the next try.
    t.loginCodes.unreachable.clear();
    challengeOf(await signIn(owner.login));
  });

  it('a new code at most once a minute, and only the newest works', async () => {
    const owner = await staffWith(['owner']);
    const first = challengeOf(await signIn(owner.login));
    const firstCode = t.loginCodes.lastCodeFor(owner.telegramId ?? 0) ?? '';

    await expect(signIn(owner.login)).rejects.toMatchObject({ code: 'rate_limited' });
    t.clock.advance(MIN);
    const second = challengeOf(await signIn(owner.login));

    await expect(
      auth().verifyCode({ challengeId: first.challengeId, code: firstCode, ...request }),
    ).rejects.toMatchObject({ code: 'code_expired' });
    const secondCode = t.loginCodes.lastCodeFor(owner.telegramId ?? 0) ?? '';
    await auth().verifyCode({ challengeId: second.challengeId, code: secondCode, ...request });
  });

  it('five wrong codes end the challenge, even for the right one after', async () => {
    const owner = await staffWith(['owner']);
    const { challengeId } = challengeOf(await signIn(owner.login));
    const code = t.loginCodes.lastCodeFor(owner.telegramId ?? 0) ?? '';
    const wrong = code === '000000' ? '111111' : '000000';

    for (let i = 0; i < 4; i += 1) {
      await expect(
        auth().verifyCode({ challengeId, code: wrong, ...request }),
      ).rejects.toMatchObject({
        code: 'invalid_code',
      });
    }
    await expect(auth().verifyCode({ challengeId, code: wrong, ...request })).rejects.toMatchObject(
      {
        code: 'code_expired',
      },
    );
    await expect(auth().verifyCode({ challengeId, code, ...request })).rejects.toMatchObject({
      code: 'code_expired',
    });
  });

  it('a code lives five minutes and works once', async () => {
    const owner = await staffWith(['owner']);
    const expired = challengeOf(await signIn(owner.login));
    const expiredCode = t.loginCodes.lastCodeFor(owner.telegramId ?? 0) ?? '';
    t.clock.advance(5 * MIN);
    await expect(
      auth().verifyCode({ challengeId: expired.challengeId, code: expiredCode, ...request }),
    ).rejects.toMatchObject({ code: 'code_expired' });

    const fresh = challengeOf(await signIn(owner.login));
    const code = t.loginCodes.lastCodeFor(owner.telegramId ?? 0) ?? '';
    await auth().verifyCode({ challengeId: fresh.challengeId, code, ...request });
    await expect(
      auth().verifyCode({ challengeId: fresh.challengeId, code, ...request }),
    ).rejects.toMatchObject({ code: 'code_expired' });
  });

  it('staff blocked between the two steps get no session', async () => {
    const owner = await staffWith(['owner']);
    await staffWith(['owner']); // so that blocking the first keeps an owner
    const { challengeId } = challengeOf(await signIn(owner.login));
    const code = t.loginCodes.lastCodeFor(owner.telegramId ?? 0) ?? '';
    await database.db.update(users).set({ isBlocked: true }).where(eq(users.id, owner.id));
    await expect(auth().verifyCode({ challengeId, code, ...request })).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});

describe('sessions', () => {
  async function signedInAdmin() {
    const admin = await staffWith(['admin']);
    return { admin, token: sessionOf(await signIn(admin.login)).token };
  }

  it('a session cookie identifies its staff member with their permissions', async () => {
    const { admin, token } = await signedInAdmin();
    const actor = await auth().authenticate(token);
    expect(actor).toMatchObject({ kind: 'staff', userId: admin.id, roles: ['admin'] });
    expect(actor?.permissions.has('orders.write')).toBe(true);
    expect(actor?.permissions.has('staff.manage')).toBe(false);
  });

  it('ends after 12 hours unused', async () => {
    const { token } = await signedInAdmin();
    t.clock.advance(12 * HOUR - 1);
    expect(await auth().authenticate(token)).not.toBeNull();
    t.clock.advance(12 * HOUR);
    expect(await auth().authenticate(token)).toBeNull();
  });

  it('lives on while used, but not beyond 30 days', async () => {
    const { token } = await signedInAdmin();
    const thirtyDays = 30 * 24 * HOUR;
    let elapsed = 0;
    while (elapsed + 11 * HOUR < thirtyDays) {
      t.clock.advance(11 * HOUR);
      elapsed += 11 * HOUR;
      expect(await auth().authenticate(token)).not.toBeNull();
    }
    // Used a few hours ago, but the thirty days are over.
    t.clock.advance(thirtyDays - elapsed);
    expect(await auth().authenticate(token)).toBeNull();
  });

  it('ends when the staff member is blocked or loses their panel role', async () => {
    const { admin, token } = await signedInAdmin();
    await database.db.update(users).set({ isBlocked: true }).where(eq(users.id, admin.id));
    expect(await auth().authenticate(token)).toBeNull();
    // And it is gone, not just refused: unblocking does not bring it back.
    await database.db.update(users).set({ isBlocked: false }).where(eq(users.id, admin.id));
    expect(await auth().authenticate(token)).toBeNull();
  });

  it('signing out ends it; an unknown token is nobody', async () => {
    const { token } = await signedInAdmin();
    await auth().signOut(token);
    expect(await auth().authenticate(token)).toBeNull();
    expect(await auth().authenticate('not-a-token')).toBeNull();
  });

  it('the database keeps only a hash of the token', async () => {
    const { token } = await signedInAdmin();
    const rows = await database.db.select({ id: sessions.id }).from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).not.toContain(token);
    expect(rows[0]?.id).toMatch(/^[0-9a-f]{64}$/);
  });
});
