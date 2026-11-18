import type { Role } from '@cs/shared/vocabulary';
import { eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '../../../db/client';
import { userRoles } from '../../../db/schema';

/** Small reads the identity use cases share. */

export async function rolesOf(db: DbOrTx, userId: string): Promise<Role[]> {
  const rows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  return rows.map((row) => row.role);
}

export async function rolesOfMany(
  db: DbOrTx,
  userIds: readonly string[],
): Promise<Map<string, Role[]>> {
  const byUser = new Map<string, Role[]>();
  if (userIds.length === 0) return byUser;
  const rows = await db
    .select({ userId: userRoles.userId, role: userRoles.role })
    .from(userRoles)
    .where(inArray(userRoles.userId, [...userIds]));
  for (const row of rows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row.role]);
  return byUser;
}

/** The PostgreSQL unique constraint a failed write ran into, if that is why it failed. */
export function violatedUniqueConstraint(error: unknown): string | undefined {
  for (let current: unknown = error; current; current = (current as { cause?: unknown }).cause) {
    const pg = current as { code?: unknown; constraint?: unknown };
    if (pg.code === '23505') return typeof pg.constraint === 'string' ? pg.constraint : '';
  }
  return undefined;
}
