import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import { INIT_DATA_AUTH_SCHEME, SESSION_COOKIE } from '@cs/shared/routes';
import Fastify, { type FastifyError, type FastifyInstance, type FastifyRequest } from 'fastify';
import type { Services } from '../composition';
import type { Logger } from '../logger';
import { auditAdminRoutes } from '../modules/audit';
import { authRoutes, staffAdminRoutes, tmaRoutes } from '../modules/identity';
import type { StaffActor, TmaActor } from '../platform/actors';
import { AppError } from '../platform/errors';
import { registerErrorHandling } from './plugins/errors';
import type { AdminContext, AuthContext, TmaContext } from './contexts';
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
    staffActor: StaffActor | null;
  }
}

/** Requests carry JSON only (photos arrive in stage 5 through their own route). */
const BODY_LIMIT_BYTES = 256 * 1024;
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
  void app.register(fastifyCookie);
  // A floor against floods; the business rules (sign-in pauses, code attempts) do the rest.
  void app.register(fastifyRateLimit, { max: 120, timeWindow: '1 minute' });

  app.get('/health', async (_request, reply) => {
    const database = await deps.checkDatabase();
    return reply.code(database ? 200 : 503).send({ ok: database });
  });

  // The Mini App: signed init data in `Authorization: tma <init data>`.
  void app.register((scope, _options, done) => {
    scope.decorateRequest('tmaActor', null);
    scope.addHook('preHandler', async (request) => {
      const header = request.headers.authorization;
      const prefix = `${INIT_DATA_AUTH_SCHEME} `;
      request.tmaActor = header?.startsWith(prefix)
        ? await services.identity.tma.authenticate(header.slice(prefix.length))
        : null;
      required(request.tmaActor);
    });
    registerGroup<'tma', TmaContext>(scope, 'tma', tmaRoutes(services.identity.tma), {
      context: (request) => ({ actor: required(request.tmaActor) }),
      validateResponses,
    });
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
      { ...staffAdminRoutes(services.identity.staff), ...auditAdminRoutes(services.audit) },
      {
        context: (request) => ({ actor: required(request.staffActor), ip: request.ip }),
        validateResponses,
      },
    );
    done();
  });

  return app;
}
