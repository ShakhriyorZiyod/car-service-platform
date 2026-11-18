import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { users } from '../../../src/db/schema';
import { useTestDatabase } from '../../helpers/db';
import { insertStaff, insertUser, uniqueTelegramId } from '../../helpers/factories';
import { createTestServices, type TestContext } from '../../helpers/services';
import { setupWorkshop } from '../../helpers/workshop-setup';

const database = useTestDatabase();
let t: TestContext;
beforeEach(async () => {
  t = createTestServices(database.db);
  await setupWorkshop(t, database.db);
});

const lookup = (telegramId: number) => t.services.identity.tma.clientByTelegramId(telegramId);

describe('the client behind a button pressed in the chat (PLAN 12)', () => {
  it('is found by the Telegram account, with their language and verified phone', async () => {
    const user = await insertUser(database.db, {
      consent: true,
      phoneVerified: true,
      telegramId: uniqueTelegramId(),
    });
    expect(await lookup(user.telegramId!)).toMatchObject({
      kind: 'client',
      userId: user.id,
      telegramId: user.telegramId,
      phone: user.phone,
    });
  });

  it('is not found when the account is unknown, has not given consent, or belongs to the staff', async () => {
    expect(await lookup(uniqueTelegramId())).toBeNull();
    const unconsented = await insertUser(database.db, {
      consent: false,
      telegramId: uniqueTelegramId(),
    });
    expect(await lookup(unconsented.telegramId!)).toBeNull();
    for (const role of ['master', 'admin', 'director', 'owner'] as const) {
      const staff = await insertStaff(database.db, [role], {
        consent: true,
        telegramId: uniqueTelegramId(),
      });
      expect(await lookup(staff.telegramId!)).toBeNull();
    }
  });

  it('an unverified phone stays out of the actor, and an erased person is not found', async () => {
    const user = await insertUser(database.db, {
      consent: true,
      phoneVerified: false,
      telegramId: uniqueTelegramId(),
    });
    expect((await lookup(user.telegramId!))?.phone).toBeNull();
    await database.db
      .update(users)
      .set({ anonymizedAt: new Date(), telegramId: null })
      .where(eq(users.id, user.id));
    expect(await lookup(user.telegramId!)).toBeNull();
  });
});
