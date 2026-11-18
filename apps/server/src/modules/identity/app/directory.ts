import { and, eq, inArray, ne } from 'drizzle-orm';
import { userRoles, users } from '../../../db/schema';
import type { StaffDirectory } from '../../../platform/ports';

/** Who the staff are, for the messages meant "for the admins" (platform/ports.ts). */
export function createStaffDirectory(): StaffDirectory {
  return {
    async recipients(tx, roles) {
      const rows = await tx
        .selectDistinct({ userId: users.id, lang: users.lang })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .where(
          and(
            inArray(userRoles.role, [...roles]),
            eq(users.isBlocked, false),
            ne(users.botAccess, 'blocked'),
          ),
        );
      return rows;
    },
  };
}
