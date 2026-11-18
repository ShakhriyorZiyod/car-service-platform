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
  'tma.requestDeletion': { method: 'POST', path: '/api/tma/me/deletion-request' },

  // Stage 3: the client's garage and booking (a verified phone is required, except for the catalog)
  'client.catalog': { method: 'GET', path: '/api/client/catalog' },
  'client.cars': { method: 'GET', path: '/api/client/cars' },
  'client.createCar': { method: 'POST', path: '/api/client/cars' },
  'client.updateCar': { method: 'PATCH', path: '/api/client/cars/:id' },
  'client.archiveCar': { method: 'POST', path: '/api/client/cars/:id/archive' },
  'client.quote': { method: 'POST', path: '/api/client/quote' },
  'client.availability': { method: 'GET', path: '/api/client/availability' },
  'client.slots': { method: 'GET', path: '/api/client/slots' },
  'client.createOrder': { method: 'POST', path: '/api/client/orders' },
  'client.orders': { method: 'GET', path: '/api/client/orders' },
  'client.order': { method: 'GET', path: '/api/client/orders/:id' },
  'client.cancelOrder': { method: 'POST', path: '/api/client/orders/:id/cancel' },
  'client.requestReschedule': { method: 'POST', path: '/api/client/orders/:id/reschedule-request' },

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

  // Stage 2: the workshop and its reference data (the owner's settings)
  'admin.workshop': { method: 'GET', path: '/api/admin/workshop' },
  'admin.settings': { method: 'GET', path: '/api/admin/settings' },
  'admin.updateSettings': { method: 'PUT', path: '/api/admin/settings' },
  'admin.workHours': { method: 'GET', path: '/api/admin/work-hours' },
  'admin.updateWorkHours': { method: 'PUT', path: '/api/admin/work-hours' },
  'admin.addHoliday': { method: 'POST', path: '/api/admin/holidays' },
  'admin.removeHoliday': { method: 'DELETE', path: '/api/admin/holidays/:date' },
  'admin.boxes': { method: 'GET', path: '/api/admin/boxes' },
  'admin.createBox': { method: 'POST', path: '/api/admin/boxes' },
  'admin.updateBox': { method: 'PATCH', path: '/api/admin/boxes/:id' },
  'admin.brands': { method: 'GET', path: '/api/admin/brands' },
  'admin.createBrand': { method: 'POST', path: '/api/admin/brands' },
  'admin.updateBrand': { method: 'PATCH', path: '/api/admin/brands/:id' },
  'admin.createModel': { method: 'POST', path: '/api/admin/models' },
  'admin.updateModel': { method: 'PATCH', path: '/api/admin/models/:id' },
  'admin.serviceTypes': { method: 'GET', path: '/api/admin/service-types' },
  'admin.createServiceType': { method: 'POST', path: '/api/admin/service-types' },
  'admin.updateServiceType': { method: 'PATCH', path: '/api/admin/service-types/:id' },
  'admin.prices': { method: 'GET', path: '/api/admin/prices/:serviceTypeId' },
  'admin.updatePrices': { method: 'PUT', path: '/api/admin/prices/:serviceTypeId' },
  'admin.createService': { method: 'POST', path: '/api/admin/services' },
  'admin.updateService': { method: 'PATCH', path: '/api/admin/services/:id' },

  // Stage 4: orders, the schedule and clients (the admin's daily work)
  'admin.today': { method: 'GET', path: '/api/admin/today' },
  'admin.catalog': { method: 'GET', path: '/api/admin/catalog' },
  'admin.cancelReasons': { method: 'GET', path: '/api/admin/cancel-reasons' },
  'admin.orders': { method: 'GET', path: '/api/admin/orders' },
  'admin.order': { method: 'GET', path: '/api/admin/orders/:id' },
  'admin.createOrder': { method: 'POST', path: '/api/admin/orders' },
  'admin.callOrder': { method: 'POST', path: '/api/admin/orders/:id/call' },
  'admin.updateOrderItems': { method: 'PUT', path: '/api/admin/orders/:id/items' },
  'admin.rescheduleOrder': { method: 'POST', path: '/api/admin/orders/:id/reschedule' },
  'admin.cancelOrder': { method: 'POST', path: '/api/admin/orders/:id/cancel' },
  'admin.noShow': { method: 'POST', path: '/api/admin/orders/:id/no-show' },
  'admin.availability': { method: 'GET', path: '/api/admin/availability' },
  'admin.slots': { method: 'GET', path: '/api/admin/slots' },
  'admin.schedule': { method: 'GET', path: '/api/admin/schedule' },
  'admin.createBlock': { method: 'POST', path: '/api/admin/blocks' },
  'admin.removeBlock': { method: 'DELETE', path: '/api/admin/blocks/:id' },
  'admin.clients': { method: 'GET', path: '/api/admin/clients' },
  'admin.createClient': { method: 'POST', path: '/api/admin/clients' },
  'admin.client': { method: 'GET', path: '/api/admin/clients/:id' },
  'admin.updateClient': { method: 'PATCH', path: '/api/admin/clients/:id' },
  'admin.createClientCar': { method: 'POST', path: '/api/admin/clients/:id/cars' },
  'admin.anonymizeClient': { method: 'POST', path: '/api/admin/clients/:id/anonymize' },
  'admin.act': { method: 'GET', path: '/api/admin/orders/:id/act' },
  'admin.saveAct': { method: 'PUT', path: '/api/admin/orders/:id/act' },
  'admin.putActPhoto': { method: 'PUT', path: '/api/admin/orders/:id/act/photos/:mediaId' },
  'admin.sendAct': { method: 'POST', path: '/api/admin/orders/:id/act/send' },
  'admin.confirmActVerbal': { method: 'POST', path: '/api/admin/orders/:id/act/confirm-verbal' },
  'admin.startWork': { method: 'POST', path: '/api/admin/orders/:id/start-work' },
  'client.act': { method: 'GET', path: '/api/client/orders/:id/act' },
  'client.confirmAct': { method: 'POST', path: '/api/client/orders/:id/act/confirm' },
  'master.tasks': { method: 'GET', path: '/api/master/tasks' },
  'master.task': { method: 'GET', path: '/api/master/tasks/:id' },
  'master.startTask': { method: 'POST', path: '/api/master/tasks/:id/start' },
  'master.putTaskPhoto': { method: 'PUT', path: '/api/master/tasks/:id/photos/:mediaId' },
  'master.deleteTaskPhoto': { method: 'DELETE', path: '/api/master/tasks/:id/photos/:mediaId' },
  'master.submitTask': { method: 'POST', path: '/api/master/tasks/:id/submit' },
  'admin.masters': { method: 'GET', path: '/api/admin/masters' },
  'admin.tasks': { method: 'GET', path: '/api/admin/tasks' },
  'admin.task': { method: 'GET', path: '/api/admin/tasks/:id' },
  'admin.createTask': { method: 'POST', path: '/api/admin/orders/:id/tasks' },
  'admin.updateTask': { method: 'PATCH', path: '/api/admin/tasks/:id' },
  'admin.acceptTask': { method: 'POST', path: '/api/admin/tasks/:id/accept' },
  'admin.reworkTask': { method: 'POST', path: '/api/admin/tasks/:id/rework' },
  'admin.addExtraItem': { method: 'POST', path: '/api/admin/orders/:id/extra-items' },
  'admin.decideExtraItem': {
    method: 'POST',
    path: '/api/admin/orders/:id/extra-items/:itemId/decision',
  },
  'client.decideExtra': { method: 'POST', path: '/api/client/orders/:id/extra/:itemId' },
  'admin.unmappedCars': { method: 'GET', path: '/api/admin/cars/unmapped' },
  'admin.mapCar': { method: 'POST', path: '/api/admin/cars/:id/map' },
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
