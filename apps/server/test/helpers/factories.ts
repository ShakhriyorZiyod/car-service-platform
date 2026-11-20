import type { Role } from '@cs/shared/vocabulary';
import type { Db } from '../../src/db/client';
import { userRoles, users } from '../../src/db/schema';
import { hashPassword } from '../../src/modules/identity/app/passwords';
import { permissionsOf } from '../../src/modules/identity/domain/roles';
import type { StaffActor } from '../../src/platform/actors';

let nextTelegramId = 500_000;
let nextPhone = 901_000_000;

export const uniqueTelegramId = (): number => (nextTelegramId += 1);
export const uniquePhone = (): string => `+998${(nextPhone += 1)}`;

/** One known password for every staff member a factory makes; hashing it once keeps tests fast. */
export const STAFF_PASSWORD = 'correct horse battery';
let passwordHash: Promise<string> | undefined;

export interface UserOverrides {
  fullName?: string;
  telegramId?: number | null;
  phone?: string | null;
  phoneVerified?: boolean;
  consent?: boolean;
  login?: string | null;
  withPassword?: boolean;
  isBlocked?: boolean;
  lang?: 'uz' | 'ru';
}

export async function insertUser(db: Db, overrides: UserOverrides = {}) {
  const login = overrides.login ?? null;
  const withPassword = overrides.withPassword ?? login !== null;
  const [user] = await db
    .insert(users)
    .values({
      fullName: overrides.fullName ?? 'Test User',
      telegramId: overrides.telegramId === undefined ? uniqueTelegramId() : overrides.telegramId,
      phone: overrides.phone === undefined ? uniquePhone() : overrides.phone,
      phoneVerified: overrides.phoneVerified ?? false,
      consentVersion: overrides.consent ? 'test' : null,
      consentAt: overrides.consent ? new Date('2026-10-01T00:00:00Z') : null,
      login,
      passwordHash: withPassword ? await (passwordHash ??= hashPassword(STAFF_PASSWORD)) : null,
      isBlocked: overrides.isBlocked ?? false,
      lang: overrides.lang ?? 'uz',
    })
    .returning();
  if (!user) throw new Error('insert returned no row');
  return user;
}

export async function grantRoles(db: Db, userId: string, roles: readonly Role[]): Promise<void> {
  if (roles.length === 0) return;
  await db.insert(userRoles).values(roles.map((role) => ({ userId, role })));
}

let nextLogin = 0;

/** A staff member; panel roles get a login and STAFF_PASSWORD. */
export async function insertStaff(db: Db, roles: readonly Role[], overrides: UserOverrides = {}) {
  const panel = roles.some((role) => role !== 'master');
  const user = await insertUser(db, {
    login: panel ? `staff${(nextLogin += 1)}` : null,
    ...overrides,
  });
  await grantRoles(db, user.id, roles);
  return user;
}

/** The actor of a staff member, as a session would establish it. */
export function staffActorOf(user: { id: string }, roles: readonly Role[]): StaffActor {
  return { kind: 'staff', userId: user.id, roles, permissions: new Set(permissionsOf(roles)) };
}

const LATIN_TO_CYRILLIC: Readonly<Record<string, string>> = {
  A: 'А',
  B: 'В',
  C: 'С',
  E: 'Е',
  H: 'Н',
  K: 'К',
  M: 'М',
  O: 'О',
  P: 'Р',
  T: 'Т',
  X: 'Х',
  Y: 'У',
};

/** A stored plate ("01123ABC") as a Russian keyboard types it, with dashes: "01-123-АВС". */
export const typedInCyrillic = (plate: string): string =>
  [...plate]
    .map((char) => LATIN_TO_CYRILLIC[char] ?? char)
    .join('')
    .replace(/^(\d{2})(\d{3}|\D)/, '$1-$2-');
