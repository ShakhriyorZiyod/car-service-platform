/**
 * Route table with no runtime dependencies, so the Mini App can import it without zod.
 * The schemas of each route live in ../contract.
 *
 * Adding an endpoint: one line here and one in the contract. The server then does not compile
 * until it has a handler returning that exact shape, and the clients get the types.
 *
 * Groups and their authentication (docs/PLAN.md, section 13):
 *   tma.*     any Telegram user (init data)
 *   client.*  a client (init data)
 *   master.*  a master (init data + role)
 *   auth.*    staff sign-in
 *   admin.*   staff panel (session cookie + permission)
 */

export const INIT_DATA_AUTH_SCHEME = 'tma';

/** The panel's session cookie: HttpOnly, so scripts never see it. */
export const SESSION_COOKIE = 'cs_session';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RouteDefinition {
  method: HttpMethod;
  path: `/api/${string}`;
}

export type RouteTable = Record<string, RouteDefinition>;

export const ROUTES = {
  'tma.bootstrap': { method: 'GET', path: '/api/tma/bootstrap' },
  'tma.saveOnboarding': { method: 'PUT', path: '/api/tma/me/onboarding' },
  'tma.updateMe': { method: 'PATCH', path: '/api/tma/me' },
  'tma.sharePhone': { method: 'POST', path: '/api/tma/me/phone' },

  'auth.login': { method: 'POST', path: '/api/auth/login' },
  'auth.verifyCode': { method: 'POST', path: '/api/auth/code' },
  'auth.logout': { method: 'POST', path: '/api/auth/logout' },
  'auth.me': { method: 'GET', path: '/api/auth/me' },
  'auth.updateMe': { method: 'PATCH', path: '/api/auth/me' },

  'admin.staffList': { method: 'GET', path: '/api/admin/staff' },
  'admin.createStaff': { method: 'POST', path: '/api/admin/staff' },
  'admin.updateStaff': { method: 'PATCH', path: '/api/admin/staff/:id' },
  'admin.setStaffPassword': { method: 'PUT', path: '/api/admin/staff/:id/password' },
  'admin.auditLog': { method: 'GET', path: '/api/admin/audit' },
} as const satisfies RouteTable;

export type RouteName = keyof typeof ROUTES;

/** The group of a route: the part of its name before the dot. */
export type RouteGroup<K extends RouteName = RouteName> = K extends `${infer G}.${string}`
  ? G
  : never;

/** The routes of one group, for registering them together with that group's authentication. */
export function routesOf<G extends RouteGroup>(group: G): Extract<RouteName, `${G}.${string}`>[] {
  return (Object.keys(ROUTES) as RouteName[]).filter((name) =>
    name.startsWith(`${group}.`),
  ) as Extract<RouteName, `${G}.${string}`>[];
}
