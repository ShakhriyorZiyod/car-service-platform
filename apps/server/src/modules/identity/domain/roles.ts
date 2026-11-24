import {
  isPanelRole,
  PERMISSIONS,
  ROLES,
  TWO_FACTOR_ROLES,
  type Permission,
  type Role,
  type Shell,
} from '@cs/shared/vocabulary';

/**
 * What roles mean (docs/PLAN.md, sections 4.7 and 8). Pure: the use cases and the tests share it.
 */

/** Roles that actually apply: none while staff access is blocked. Sorted, without repeats. */
export function effectiveRoles(roles: readonly Role[], isBlocked: boolean): Role[] {
  if (isBlocked) return [];
  return ROLES.filter((role) => roles.includes(role));
}

/**
 * Which part of the Mini App opens. A master gets the master's part even with other roles; panel
 * roles get a pointer to the panel; everyone else is a client.
 */
export function shellOf(roles: readonly Role[]): Shell {
  if (roles.includes('master')) return 'master';
  if (roles.some(isPanelRole)) return 'staff';
  return 'client';
}

const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  master: [],
  admin: [
    'panel.access',
    'today.read',
    'orders.read',
    'orders.write',
    'schedule.read',
    'schedule.write',
    'reception.write',
    'tasks.review',
    'checkout.write',
    'clients.read',
    'clients.write',
    'stock.read',
    'stock.write',
    'shop.read',
    'shop.write',
  ],
  /**
   * Reads what the admin works on; reports and analytics come in v2. Unlike the admin, sees the
   * purchase prices and average costs (TZ 2).
   */
  director: [
    'panel.access',
    'today.read',
    'orders.read',
    'schedule.read',
    'clients.read',
    'stock.read',
    'costs.read',
    'shop.read',
  ],
  owner: PERMISSIONS,
};

/** The union of what the roles allow, in the order of PERMISSIONS. */
export function permissionsOf(roles: readonly Role[]): Permission[] {
  const granted = new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role]));
  return PERMISSIONS.filter((permission) => granted.has(permission));
}

export function canUsePanel(roles: readonly Role[]): boolean {
  return roles.some(isPanelRole);
}

export function needsSecondFactor(roles: readonly Role[]): boolean {
  return roles.some((role) => (TWO_FACTOR_ROLES as readonly Role[]).includes(role));
}
