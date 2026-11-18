import {
  contract,
  ROUTES,
  routesOf,
  type EndpointSchemas,
  type ParsedRequestOf,
  type ResponseOf,
  type RouteGroup,
  type RouteName,
} from '@cs/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { AppError } from '../platform/errors';

/**
 * Binds the shared contract to Fastify (docs/PLAN.md, section 4.6). A handler receives validated
 * input and must return exactly the declared response shape; it holds no business logic and only
 * calls a service method.
 */
export type RouteHandler<K extends RouteName, Context> = (
  input: ParsedRequestOf<K>,
  context: Context,
) => Promise<ResponseOf<K>>;

type RoutesOfGroup<G extends RouteGroup> = Extract<RouteName, `${G}.${string}`>;

/** Every route of a group needs a handler: a new route without one does not compile. */
export type GroupRoutes<G extends RouteGroup, Context> = {
  [K in RoutesOfGroup<G>]: RouteHandler<K, Context>;
};

export interface GroupOptions<Context> {
  /** Who is asking; built after the group's authentication hook has run. */
  context: (request: FastifyRequest, reply: FastifyReply) => Context;
  /** Responses are checked at compile time always, and at runtime outside production. */
  validateResponses: boolean;
}

/** PostgreSQL cannot store this character: left alone, it would come back as a server error. */
const hasNullCharacter = (value: unknown): boolean =>
  JSON.stringify(value ?? null).includes('\\u0000');

function parseField(schema: z.ZodType, value: unknown, field: string): unknown {
  if (hasNullCharacter(value)) throw new AppError('validation', `invalid request ${field}`);
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError('validation', `invalid request ${field}`, {
      paths: parsed.error.issues.map((issue) => [field, ...issue.path].join('.')),
    });
  }
  return parsed.data;
}

function readInput(request: FastifyRequest, schemas: EndpointSchemas): unknown {
  return {
    ...(schemas.params && { params: parseField(schemas.params, request.params, 'params') }),
    ...(schemas.query && { query: parseField(schemas.query, request.query, 'query') }),
    ...(schemas.body && { body: parseField(schemas.body, request.body, 'body') }),
  };
}

function registerRoute<K extends RouteName, Context>(
  app: FastifyInstance,
  name: K,
  handler: RouteHandler<K, Context>,
  options: GroupOptions<Context>,
): void {
  const { method, path } = ROUTES[name];
  const schemas: EndpointSchemas = contract[name];

  app.route({
    method,
    url: path,
    handler: async (request, reply) => {
      const input = readInput(request, schemas) as ParsedRequestOf<K>;
      const output = await handler(input, options.context(request, reply));
      return options.validateResponses ? schemas.response.parse(output) : output;
    },
  });
}

/** Registers all routes of a group on `app`, usually a scope that carries the group's auth hook. */
export function registerGroup<G extends RouteGroup, Context>(
  app: FastifyInstance,
  group: G,
  handlers: GroupRoutes<G, Context>,
  options: GroupOptions<Context>,
): void {
  for (const name of routesOf(group)) {
    registerRoute(app, name, handlers[name] as RouteHandler<typeof name, Context>, options);
  }
}
