import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { settings, users } from '../../src/db/schema';
import { insertUser } from '../helpers/factories';
import { useTestDatabase } from '../helpers/db';

const database = useTestDatabase();

/** Postgres refuses a row that breaks a CHECK with this code. */
const CHECK_VIOLATION = { cause: { code: '23514' } };

const ACCEPTED = ['+998901234567', '+998712345678', '+79161234567', '+996555123456'];
const REFUSED = [
  '998901234567', // no "+": Telegram's own form, not the stored one
  '901234567',
  '+998 90 123 45 67', // spaces
  '+99890123456', // an Uzbek number one digit short
  '+9989012345678', // and one digit too long
  '+0123456789',
  '+1234567', // seven digits
  '+1234567890123456', // sixteen
];

describe('a stored phone is in one form, +998XXXXXXXXX (PLAN 22, 2026-11-24)', () => {
  it.each(ACCEPTED)('a user may have %s', async (phone) => {
    const user = await insertUser(database.db, { phone });
    const [row] = await database.db.select().from(users).where(eq(users.id, user.id));
    expect(row?.phone).toBe(phone);
  });

  it.each(REFUSED)('a user may not have %j', async (phone) => {
    await expect(insertUser(database.db, { phone })).rejects.toMatchObject(CHECK_VIOLATION);
  });

  it('no phone at all is allowed', async () => {
    const user = await insertUser(database.db, { phone: null });
    const [row] = await database.db.select().from(users).where(eq(users.id, user.id));
    expect(row?.phone).toBeNull();
  });

  const saveWorkshopPhone = (phone: string | null) =>
    database.db
      .insert(settings)
      .values({ id: 1, data: { workshop: { phone } } })
      .onConflictDoUpdate({ target: settings.id, set: { data: { workshop: { phone } } } });

  it.each([...ACCEPTED, null])('the workshop may show %j', async (phone) => {
    await saveWorkshopPhone(phone);
    const [row] = await database.db.select().from(settings);
    expect(row?.data).toEqual({ workshop: { phone } });
  });

  it.each(REFUSED)('the workshop may not show %j', async (phone) => {
    await expect(saveWorkshopPhone(phone)).rejects.toMatchObject(CHECK_VIOLATION);
  });

  it('settings without a workshop phone are allowed', async () => {
    await database.db.insert(settings).values({ id: 1, data: { rules: {} } });
    expect(await database.db.select().from(settings)).toHaveLength(1);
  });
});
