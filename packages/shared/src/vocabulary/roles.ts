/**
 * Staff roles (docs/PLAN.md, section 8). There is no client role: anyone without a role is a
 * client. One person may hold several roles; their permissions add up.
 */
export const ROLES = ['master', 'admin', 'director', 'owner'] as const;
export type Role = (typeof ROLES)[number];

/** Roles that work in the web panel and therefore sign in with a login and a password. */
export const PANEL_ROLES = ['admin', 'director', 'owner'] as const satisfies readonly Role[];

/** Roles that must confirm a sign-in with a code sent by the bot (TZ 2, 15.2). */
export const TWO_FACTOR_ROLES = ['director', 'owner'] as const satisfies readonly Role[];

export const isPanelRole = (role: Role): boolean => (PANEL_ROLES as readonly Role[]).includes(role);

/**
 * What a staff member may do (section 8). The server maps roles to these in
 * identity/domain/permissions.ts; the panel uses the list it receives only to hide what is not
 * allowed, and the API refuses it anyway.
 */
export const PERMISSIONS = [
  'panel.access',
  'today.read',
  'orders.read',
  'orders.write',
  'schedule.read',
  'schedule.write',
  'reception.write',
  'tasks.review',
  'checkout.write',
  'discount.unlimited',
  'orders.cancel_in_work',
  'payments.correct',
  'clients.read',
  'clients.write',
  'clients.anonymize',
  'settings.write',
  'staff.manage',
  'audit.read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];
