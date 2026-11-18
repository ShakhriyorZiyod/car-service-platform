import type { Role } from '@cs/shared/vocabulary';
import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { auditLog, sessions, users } from '../../../src/db/schema';
import { useTestDatabase } from '../../helpers/db';
import {
  insertStaff,
  insertUser,
  STAFF_PASSWORD,
  staffActorOf,
  uniquePhone,
} from '../../helpers/factories';
import { createTestServices, type TestContext } from '../../helpers/services';

const database = useTestDatabase();
let t: TestContext;
beforeEach(() => {
  t = createTestServices(database.db);
});

const staff = () => t.services.identity.staff;

async function actorWith(roles: Role[]) {
  const user = await insertStaff(database.db, roles);
  return { user, actor: staffActorOf(user, roles) };
}

const newAdmin = () => ({
  fullName: 'Dilfuza Sobirova',
  phone: uniquePhone(),
  roles: ['admin'] as Role[],
  login: `dilfuza${Math.floor(Math.random() * 1e6)}`,
  password: 'a long password',
});

describe('only the owner manages staff', () => {
  it.each<Role[]>([['admin'], ['director'], ['master']])('%j is refused', async (...roles) => {
    const { actor } = await actorWith(roles);
    await expect(staff().list(actor)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(staff().create(actor, newAdmin())).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('the audit log is the owner’s too', async () => {
    const { actor } = await actorWith(['admin']);
    await expect(t.services.audit.list(actor, { limit: 10 })).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});

describe('adding staff', () => {
  it('a panel member needs a login and a first password, and can sign in at once', async () => {
    const { actor } = await actorWith(['owner']);
    const { login: _login, ...withoutLogin } = newAdmin();
    await expect(staff().create(actor, withoutLogin)).rejects.toMatchObject({
      code: 'validation',
      details: { paths: ['body.login'] },
    });
    const { password: _password, ...withoutPassword } = newAdmin();
    await expect(staff().create(actor, withoutPassword)).rejects.toMatchObject({
      details: { paths: ['body.password'] },
    });

    const input = newAdmin();
    const created = await staff().create(actor, input);
    expect(created).toMatchObject({ roles: ['admin'], login: input.login, telegramLinked: false });
    const result = await t.services.identity.auth.signIn({
      identifier: input.login,
      password: input.password,
      ip: '127.0.0.1',
      userAgent: null,
    });
    expect(result.kind).toBe('signed_in');
  });

  it('a master has neither login nor password', async () => {
    const { actor } = await actorWith(['owner']);
    const master = await staff().create(actor, {
      fullName: 'Odilbek',
      phone: uniquePhone(),
      roles: ['master'],
      specialization: 'Kimyoviy tozalash, yuvish',
    });
    expect(master).toMatchObject({ login: null, specialization: 'Kimyoviy tozalash, yuvish' });
    await expect(
      staff().create(actor, {
        fullName: 'X',
        phone: uniquePhone(),
        roles: ['master'],
        login: 'xyz',
      }),
    ).rejects.toMatchObject({ details: { paths: ['body.login'] } });
  });

  it('a login belongs to one person', async () => {
    const { actor } = await actorWith(['owner']);
    const first = newAdmin();
    await staff().create(actor, first);
    await expect(
      staff().create(actor, { ...newAdmin(), login: first.login.toUpperCase() }),
    ).rejects.toMatchObject({
      code: 'login_taken',
    });
  });

  it('a client already in the Mini App becomes staff in the same row', async () => {
    const { actor } = await actorWith(['owner']);
    const client = await insertUser(database.db, { phoneVerified: true });
    const master = await staff().create(actor, {
      fullName: 'Javohir',
      phone: client.phone ?? '',
      roles: ['master'],
    });
    expect(master).toMatchObject({ id: client.id, telegramLinked: true, roles: ['master'] });
  });

  it('the number of another staff member is refused', async () => {
    const { actor } = await actorWith(['owner']);
    const existing = await insertStaff(database.db, ['master']);
    await expect(
      staff().create(actor, { fullName: 'X', phone: existing.phone ?? '', roles: ['master'] }),
    ).rejects.toMatchObject({ code: 'phone_taken' });
  });

  it('is written to the audit log, without the password', async () => {
    const { user, actor } = await actorWith(['owner']);
    const created = await staff().create(actor, newAdmin(), '10.0.0.1');
    const [entry] = await database.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, created.id));
    expect(entry).toMatchObject({ actorId: user.id, action: 'staff.create', ip: '10.0.0.1' });
    expect(JSON.stringify(entry)).not.toContain('a long password');
    expect(JSON.stringify(entry)).not.toContain('argon2');
  });
});

describe('changing staff', () => {
  it('roles change and are logged with before and after', async () => {
    const { actor } = await actorWith(['owner']);
    const master = await insertStaff(database.db, ['master']);
    const updated = await staff().update(actor, master.id, {
      roles: ['master', 'admin'],
      login: 'odil.admin',
    });
    expect(updated.roles).toEqual(['master', 'admin']);
    const [entry] = await database.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'staff.update'));
    expect(entry).toMatchObject({
      before: expect.objectContaining({ roles: ['master'] }) as unknown,
      after: expect.objectContaining({ roles: ['master', 'admin'] }) as unknown,
    });
  });

  it('a new panel role needs a login', async () => {
    const { actor } = await actorWith(['owner']);
    const master = await insertStaff(database.db, ['master']);
    await expect(staff().update(actor, master.id, { roles: ['admin'] })).rejects.toMatchObject({
      details: { paths: ['body.login'] },
    });
  });

  it('the last active owner can be neither demoted nor blocked', async () => {
    const { user: me, actor } = await actorWith(['owner']);
    const other = await insertStaff(database.db, ['owner']);
    await staff().update(actor, other.id, { isBlocked: true });

    await expect(staff().update(actor, me.id, { roles: ['admin'] })).rejects.toMatchObject({
      code: 'last_owner',
    });
    // With another active owner again, it is allowed.
    await staff().update(actor, other.id, { isBlocked: false });
    await staff().update(actor, me.id, { roles: ['admin'] });
  });

  it('nobody blocks themselves', async () => {
    const { user, actor } = await actorWith(['owner']);
    await insertStaff(database.db, ['owner']);
    await expect(staff().update(actor, user.id, { isBlocked: true })).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('blocking signs the person out everywhere', async () => {
    const { actor } = await actorWith(['owner']);
    const admin = await insertStaff(database.db, ['admin']);
    const { token } = await signIn(admin.login ?? '');
    await staff().update(actor, admin.id, { isBlocked: true });
    expect(
      await database.db.select().from(sessions).where(eq(sessions.userId, admin.id)),
    ).toHaveLength(0);
    expect(await t.services.identity.auth.authenticate(token)).toBeNull();
  });

  it('a new password signs the person out, and needs a login', async () => {
    const { actor } = await actorWith(['owner']);
    const admin = await insertStaff(database.db, ['admin']);
    const { token } = await signIn(admin.login ?? '');
    await staff().setPassword(actor, admin.id, 'another long password');
    expect(await t.services.identity.auth.authenticate(token)).toBeNull();

    const master = await insertStaff(database.db, ['master']);
    await expect(staff().setPassword(actor, master.id, 'some password')).rejects.toMatchObject({
      details: { paths: ['body.password'] },
    });
  });

  it('a number verified by Telegram is not changed from the panel', async () => {
    const { actor } = await actorWith(['owner']);
    const linked = await insertStaff(database.db, ['master'], { phoneVerified: true });
    await expect(staff().update(actor, linked.id, { phone: uniquePhone() })).rejects.toMatchObject({
      details: { paths: ['body.phone'] },
    });
    const unlinked = await insertStaff(database.db, ['master'], { telegramId: null });
    const phone = uniquePhone();
    expect((await staff().update(actor, unlinked.id, { phone })).phone).toBe(phone);
  });

  it('clients are not staff and cannot be changed here', async () => {
    const { actor } = await actorWith(['owner']);
    const client = await insertUser(database.db);
    await expect(staff().update(actor, client.id, { fullName: 'X' })).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('the list holds staff only, blocked ones included', async () => {
    const { actor } = await actorWith(['owner']);
    await insertUser(database.db);
    await insertStaff(database.db, ['master'], { isBlocked: true });
    const list = await staff().list(actor);
    expect(list).toHaveLength(2);
    expect(list.some((member) => member.isBlocked)).toBe(true);
  });
});

describe('the first owner, from the command line', () => {
  it('creates an owner who can sign in, and is logged without an actor', async () => {
    const owner = await staff().bootstrapOwner({
      fullName: 'Egasi',
      phone: '+998 90 000 00 01',
      login: 'Owner',
      password: STAFF_PASSWORD,
    });
    expect(owner).toMatchObject({ roles: ['owner'], login: 'owner', phone: '+998900000001' });
    const [entry] = await database.db.select().from(auditLog).orderBy(asc(auditLog.id));
    expect(entry).toMatchObject({ action: 'owner.bootstrap', actorId: null });
  });

  it('makes an existing person the owner', async () => {
    const client = await insertUser(database.db);
    const owner = await staff().bootstrapOwner({
      fullName: 'Egasi',
      phone: client.phone ?? '',
      login: 'owner2',
      password: STAFF_PASSWORD,
    });
    expect(owner.id).toBe(client.id);
    expect(await database.db.select().from(users)).toHaveLength(1);
  });
});

async function signIn(login: string) {
  const result = await t.services.identity.auth.signIn({
    identifier: login,
    password: STAFF_PASSWORD,
    ip: '127.0.0.1',
    userAgent: null,
  });
  if (result.kind !== 'signed_in') throw new Error('expected a session');
  return result;
}
