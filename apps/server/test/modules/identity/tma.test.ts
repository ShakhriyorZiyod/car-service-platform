import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { signContact, signInitData, type DevTelegramUser } from '../../../scripts/telegram-signing';
import { users } from '../../../src/db/schema';
import type { TmaActor } from '../../../src/platform/actors';
import { useTestDatabase } from '../../helpers/db';
import { insertStaff, insertUser, uniquePhone, uniqueTelegramId } from '../../helpers/factories';
import {
  ADMIN_URL,
  createTestServices,
  TEST_BOT_TOKEN,
  type TestContext,
} from '../../helpers/services';

const database = useTestDatabase();
let t: TestContext;
beforeEach(() => {
  t = createTestServices(database.db);
});

const tma = () => t.services.identity.tma;
const telegramUser = (overrides: Partial<DevTelegramUser> = {}): DevTelegramUser => ({
  id: uniqueTelegramId(),
  firstName: 'Aziz',
  lastName: 'Karimov',
  languageCode: 'uz',
  ...overrides,
});

async function open(user: DevTelegramUser): Promise<TmaActor> {
  const actor = await tma().authenticate(signInitData(user, TEST_BOT_TOKEN, t.clock.now()));
  if (!actor) throw new Error('init data was rejected');
  return actor;
}

/** Opens the app, gives consent and returns the actor. */
async function onboarded(user: DevTelegramUser): Promise<TmaActor> {
  const actor = await open(user);
  await tma().saveOnboarding(actor, { lang: 'uz', fullName: 'Aziz Karimov' });
  return actor;
}

const contactOf = (user: DevTelegramUser, phone: string) =>
  signContact(
    { userId: user.id, phone: phone.replace('+', ''), firstName: user.firstName },
    TEST_BOT_TOKEN,
    t.clock.now(),
  );

const usersWithTelegram = (telegramId: number) =>
  database.db.select().from(users).where(eq(users.telegramId, telegramId));

describe('the first launch', () => {
  it('creates the user once, even when requests race', async () => {
    const user = telegramUser();
    const actors = await Promise.all(Array.from({ length: 5 }, () => open(user)));
    expect(new Set(actors.map((actor) => actor.userId)).size).toBe(1);
    expect(await usersWithTelegram(user.id)).toHaveLength(1);
  });

  it('refuses init data that is not valid, and creates nobody', async () => {
    const user = telegramUser();
    const forged = signInitData(user, '1234567890:another-bot', t.clock.now());
    expect(await tma().authenticate(forged)).toBeNull();
    expect(await usersWithTelegram(user.id)).toHaveLength(0);
  });

  it('a new person is a client without consent, speaking their Telegram language', async () => {
    const actor = await open(telegramUser({ languageCode: 'ru' }));
    expect(await tma().bootstrap(actor)).toMatchObject({
      user: { fullName: 'Aziz Karimov', lang: 'ru', phone: null, consentGiven: false },
      shell: 'client',
      roles: [],
      links: { admin: null },
    });
  });

  it('onboarding records consent, the chosen language and name', async () => {
    const actor = await open(telegramUser());
    const result = await tma().saveOnboarding(actor, { lang: 'ru', fullName: 'Aziz' });
    expect(result.user).toMatchObject({ fullName: 'Aziz', lang: 'ru', consentGiven: true });
    const [row] = await database.db.select().from(users).where(eq(users.id, actor.userId));
    expect(row?.consentVersion).toBeTruthy();
    expect(row?.consentAt).toEqual(t.clock.now());
  });
});

describe('sharing a phone number (PLAN 7.2)', () => {
  it('needs consent first', async () => {
    const user = telegramUser();
    const actor = await open(user);
    await expect(tma().sharePhone(actor, contactOf(user, uniquePhone()))).rejects.toMatchObject({
      code: 'consent_required',
    });
  });

  it('a free number becomes the user’s, verified', async () => {
    const user = telegramUser();
    const actor = await onboarded(user);
    const phone = uniquePhone();
    const result = await tma().sharePhone(actor, contactOf(user, phone));
    expect(result.user.phone).toBe(phone);
    const [row] = await database.db.select().from(users).where(eq(users.id, actor.userId));
    expect(row?.phoneVerified).toBe(true);
  });

  it('refuses someone else’s contact', async () => {
    const user = telegramUser();
    const actor = await onboarded(user);
    const other = telegramUser();
    await expect(tma().sharePhone(actor, contactOf(other, uniquePhone()))).rejects.toMatchObject({
      code: 'invalid_contact',
    });
  });

  it('a master added by the owner gets the master part once they share their number', async () => {
    const phone = uniquePhone();
    const staff = await insertStaff(database.db, ['master'], {
      telegramId: null,
      phone,
      fullName: 'Odilbek',
    });
    const user = telegramUser();
    const actor = await onboarded(user);

    const result = await tma().sharePhone(actor, contactOf(user, phone));

    expect(result).toMatchObject({
      user: { id: staff.id, fullName: 'Odilbek', phone },
      shell: 'master',
    });
    // One person, one row: the fresh row is gone, the staff row carries the Telegram account.
    const rows = await usersWithTelegram(user.id);
    expect(rows.map((row) => row.id)).toEqual([staff.id]);
    expect(await database.db.select().from(users).where(eq(users.id, actor.userId))).toHaveLength(
      0,
    );
    // And the next launch finds the staff row.
    expect((await open(user)).userId).toBe(staff.id);
  });

  it('a client entered by phone keeps their row; the choices made in onboarding move along', async () => {
    const phone = uniquePhone();
    const client = await insertUser(database.db, {
      telegramId: null,
      phone,
      fullName: 'Sardor Rahimov',
    });
    const user = telegramUser();
    const actor = await open(user);
    await tma().saveOnboarding(actor, { lang: 'ru', fullName: 'Sardor' });

    const result = await tma().sharePhone(actor, contactOf(user, phone));

    expect(result).toMatchObject({
      user: { id: client.id, fullName: 'Sardor Rahimov', lang: 'ru', consentGiven: true },
      shell: 'client',
    });
  });

  it('a number of another Telegram account is refused, and nothing changes', async () => {
    const phone = uniquePhone();
    await insertUser(database.db, { phone, phoneVerified: true });
    const user = telegramUser();
    const actor = await onboarded(user);

    await expect(tma().sharePhone(actor, contactOf(user, phone))).rejects.toMatchObject({
      code: 'phone_taken',
    });
    expect((await tma().bootstrap(actor)).user.phone).toBeNull();
  });

  it('two people sharing the same free number at once: exactly one gets it', async () => {
    const phone = uniquePhone();
    const [a, b] = [telegramUser(), telegramUser()];
    const [actorA, actorB] = await Promise.all([onboarded(a), onboarded(b)]);

    const results = await Promise.allSettled([
      tma().sharePhone(actorA, contactOf(a, phone)),
      tma().sharePhone(actorB, contactOf(b, phone)),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'phone_taken' },
    });
  });

  it('two people sharing the number of one unlinked staff row at once: one links', async () => {
    const phone = uniquePhone();
    const staff = await insertStaff(database.db, ['master'], { telegramId: null, phone });
    const [a, b] = [telegramUser(), telegramUser()];
    const [actorA, actorB] = await Promise.all([onboarded(a), onboarded(b)]);

    const results = await Promise.allSettled([
      tma().sharePhone(actorA, contactOf(a, phone)),
      tma().sharePhone(actorB, contactOf(b, phone)),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const [row] = await database.db.select().from(users).where(eq(users.id, staff.id));
    expect([a.id, b.id]).toContain(row?.telegramId);
  });
});

describe('which part opens', () => {
  it('panel staff get a pointer to the panel', async () => {
    const user = telegramUser();
    await insertStaff(database.db, ['admin'], { telegramId: user.id });
    const actor = await open(user);
    expect(await tma().bootstrap(actor)).toMatchObject({
      shell: 'staff',
      roles: ['admin'],
      links: { admin: ADMIN_URL },
    });
  });

  it('blocked staff get the client part and no roles', async () => {
    const user = telegramUser();
    await insertStaff(database.db, ['master'], { telegramId: user.id, isBlocked: true });
    const actor = await open(user);
    expect(actor.roles).toEqual([]);
    expect(await tma().bootstrap(actor)).toMatchObject({ shell: 'client', roles: [] });
  });
});
