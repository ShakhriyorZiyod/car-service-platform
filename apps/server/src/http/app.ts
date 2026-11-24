import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import { INIT_DATA_AUTH_SCHEME, SESSION_COOKIE } from '@cs/shared/routes';
import { LIMITS } from '@cs/shared/vocabulary';
import Fastify, { type FastifyError, type FastifyInstance, type FastifyRequest } from 'fastify';
import type { Services } from '../composition';
import type { Logger } from '../logger';
import { auditAdminRoutes } from '../modules/audit';
import { catalogAdminRoutes, catalogClientRoutes, catalogStaffRoutes } from '../modules/catalog';
import { clientsAdminRoutes } from '../modules/clients';
import { receptionAdminRoutes, receptionClientRoutes } from '../modules/reception';
import { tasksAdminRoutes, tasksMasterRoutes } from '../modules/tasks';
import { registerMediaRoute } from '../modules/media';
import { garageAdminRoutes, garageClientRoutes } from '../modules/garage';
import { authRoutes, staffAdminRoutes, tmaRoutes } from '../modules/identity';
import {
  adminOrdersRoutes,
  extrasAdminRoutes,
  extrasClientRoutes,
  ordersClientRoutes,
} from '../modules/orders';
import { workshopAdminRoutes } from '../modules/workshop';
import { dashboardAdminRoutes } from '../modules/dashboard';
import { paymentsAdminRoutes, paymentsClientRoutes } from '../modules/payments';
import { stockAdminRoutes } from '../modules/stock';
import type { ClientActor, MasterActor, StaffActor, TmaActor } from '../platform/actors';
import { AppError } from '../platform/errors';
import { registerErrorHandling } from './plugins/errors';
import type {
  AdminContext,
  AuthContext,
  ClientContext,
  MasterContext,
  TmaContext,
} from './contexts';
import { registerGroup } from './route';

export interface HttpDeps {
  logger: Logger;
  services: Services;
  /** Answers /health; the HTTP layer itself never touches the database. */
  checkDatabase: () => Promise<boolean>;
  /** True outside production, see route.ts. */
  validateResponses: boolean;
  /** The session cookie travels only over HTTPS; off for local http development. */
  cookieSecure: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    tmaActor: TmaActor | null;
    clientActor: ClientActor | null;
    masterActor: MasterActor | null;
    staffActor: StaffActor | null;
  }
}

/** Requests carry JSON, except a photo, which is raw bytes. */
const BODY_LIMIT_BYTES = 256 * 1024;
/** A photo may be a little over the limit the media module sets, so that module gives the answer. */
const PHOTO_BODY_LIMIT_BYTES = LIMITS.photoBytes.max + 64 * 1024;
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * A browser sends Origin with every changing request. One from another site is refused, on top
 * of the SameSite=Strict cookie (docs/PLAN.md, section 15).
 */
function sameOriginOnly(request: FastifyRequest): void {
  if (SAFE_METHODS.has(request.method)) return;
  const origin = request.headers.origin;
  if (origin === undefined) return;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    throw new AppError('forbidden', 'malformed origin');
  }
  if (host !== request.headers.host) throw new AppError('forbidden', 'cross-site request');
}

function required<T>(value: T | null): T {
  if (value === null) throw new AppError('unauthorized');
  return value;
}

export function createHttpApp(deps: HttpDeps): FastifyInstance {
  const { services, validateResponses } = deps;
  // Fastify's request log would write every URL, and a query string may hold a phone number or a
  // name. Failures are logged by the error handler instead. nginx in front is the only proxy.
  const app = Fastify({ logger: false, bodyLimit: BODY_LIMIT_BYTES, trustProxy: '127.0.0.1' });

  registerErrorHandling(app, deps.logger);

  // A photo comes as its own bytes: the type is found out from them, whatever the header says.
  app.addContentTypeParser(
    ['application/octet-stream', 'image/jpeg', 'image/png', 'image/webp'],
    { parseAs: 'buffer', bodyLimit: PHOTO_BODY_LIMIT_BYTES },
    (_request, body, done) => {
      done(null, body);
    },
  );

  /** Init data in `Authorization: tma <init data>`; the actor, or 401. */
  const authenticateTma = async (request: FastifyRequest): Promise<TmaActor> => {
    const header = request.headers.authorization;
    const prefix = `${INIT_DATA_AUTH_SCHEME} `;
    const actor = header?.startsWith(prefix)
      ? await services.identity.tma.authenticate(header.slice(prefix.length))
      : null;
    return required(actor);
  };
  void app.register(fastifyCookie);
  // A floor against floods; the business rules (sign-in pauses, code attempts) do the rest.
  // 600 a minute per address: the whole workshop (panel tabs, masters' phones on the Wi-Fi) shares
  // one address, and its screens refresh every 10–20 seconds (PLAN 22, 2026-11-19).
  void app.register(fastifyRateLimit, { max: 600, timeWindow: '1 minute' });

  // Inside a plugin, so that they are added after the rate limit has loaded and fall under it too:
  // a route added to the root right away would not (found in the stage 7 review).
  void app.register((scope, _options, done) => {
    // A photo: the signed link is its own permission, so there is no session or init data here.
    registerMediaRoute(scope, services.media);

    scope.get('/health', async (_request, reply) => {
      const database = await deps.checkDatabase();
      return reply.code(database ? 200 : 503).send({ ok: database });
    });
    done();
  });

  // The Mini App: signed init data in `Authorization: tma <init data>`.
  void app.register((scope, _options, done) => {
    scope.decorateRequest('tmaActor', null);
    scope.addHook('preHandler', async (request) => {
      request.tmaActor = await authenticateTma(request);
    });
    registerGroup<'tma', TmaContext>(
      scope,
      'tma',
      tmaRoutes(services.identity.tma, services.identity.clients),
      {
        context: (request) => ({ actor: required(request.tmaActor) }),
        validateResponses,
      },
    );
    done();
  });

  // The client's part of the Mini App: the same init data, and the person must be a client who has
  // given consent. A verified phone is checked by the use cases that need it.
  void app.register((scope, _options, done) => {
    scope.decorateRequest('clientActor', null);
    scope.addHook('preHandler', async (request) => {
      request.clientActor = await services.identity.tma.client(await authenticateTma(request));
    });
    registerGroup<'client', ClientContext>(
      scope,
      'client',
      {
        ...catalogClientRoutes(services.catalog.offers),
        ...garageClientRoutes(services.garage),
        ...ordersClientRoutes(services.orders),
        ...receptionClientRoutes(services.reception),
        ...extrasClientRoutes(services.extras),
        ...paymentsClientRoutes(services.payments),
      },
      { context: (request) => ({ actor: required(request.clientActor) }), validateResponses },
    );
    done();
  });

  // The master's part of the Mini App: the same init data, and the person must hold the master
  // role. Every use case works on the master's own tasks only.
  void app.register((scope, _options, done) => {
    scope.decorateRequest('masterActor', null);
    scope.addHook('preHandler', async (request) => {
      request.masterActor = await services.identity.tma.master(await authenticateTma(request));
    });
    registerGroup<'master', MasterContext>(
      scope,
      'master',
      tasksMasterRoutes(services.taskService),
      {
        context: (request) => ({ actor: required(request.masterActor) }),
        validateResponses,
      },
    );
    done();
  });

  // Signing in to the panel: sets and clears the session cookie.
  void app.register((scope, _options, done) => {
    scope.addHook('preHandler', (request, _reply, done) => {
      try {
        sameOriginOnly(request);
      } catch (error) {
        done(error as FastifyError);
        return;
      }
      done();
    });
    registerGroup<'auth', AuthContext>(scope, 'auth', authRoutes(services.identity.auth), {
      context: (request, reply) => ({
        ip: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
        sessionToken: request.cookies[SESSION_COOKIE],
        startSession: (token) => {
          void reply.setCookie(SESSION_COOKIE, token, {
            httpOnly: true,
            secure: deps.cookieSecure,
            sameSite: 'strict',
            path: '/api',
            maxAge: SESSION_MAX_AGE_SECONDS,
          });
        },
        endSession: () => {
          void reply.clearCookie(SESSION_COOKIE, { path: '/api' });
        },
      }),
      validateResponses,
    });
    done();
  });

  // The panel: a valid session; each use case checks its own permission.
  void app.register((scope, _options, done) => {
    scope.decorateRequest('staffActor', null);
    scope.addHook('preHandler', async (request) => {
      sameOriginOnly(request);
      const token = request.cookies[SESSION_COOKIE];
      request.staffActor = token ? await services.identity.auth.authenticate(token) : null;
      required(request.staffActor);
    });
    registerGroup<'admin', AdminContext>(
      scope,
      'admin',
      {
        ...staffAdminRoutes(services.identity.staff),
        ...auditAdminRoutes(services.audit),
        ...workshopAdminRoutes(services.workshop),
        ...catalogAdminRoutes(services.catalog),
        ...catalogStaffRoutes(services.catalog.offers),
        ...adminOrdersRoutes(services.adminOrders, services.schedule),
        ...clientsAdminRoutes(services.clients),
        ...garageAdminRoutes(services.garage),
        ...receptionAdminRoutes(services.reception),
        ...tasksAdminRoutes(services.taskService),
        ...extrasAdminRoutes(services.extras),
        ...paymentsAdminRoutes(services.payments),
        ...dashboardAdminRoutes(services.dashboard),
        ...stockAdminRoutes(services.stock),
      },
      {
        context: (request) => ({ actor: required(request.staffActor), ip: request.ip }),
        validateResponses,
      },
    );
    done();
  });

  return app;
}
