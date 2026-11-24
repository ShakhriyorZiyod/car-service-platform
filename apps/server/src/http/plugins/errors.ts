import type { ApiError, ApiErrorCode } from '@cs/shared';
import type { FastifyInstance } from 'fastify';
import type { Logger } from '../../logger';
import { isAppError, type AppErrorCode } from '../../platform/errors';

/** Statuses of expected failures (docs/PLAN.md, section 4.5). Stages add their codes here. */
const APP_ERROR_STATUS: Record<AppErrorCode, number> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  rate_limited: 429,

  invalid_credentials: 401,
  login_locked: 429,
  two_factor_unavailable: 409,
  invalid_code: 400,
  code_expired: 410,
  consent_required: 403,
  invalid_contact: 400,
  phone_taken: 409,
  login_taken: 409,
  last_owner: 409,

  name_taken: 409,

  phone_required: 403,
  plate_taken: 409,
  car_has_active_orders: 409,
  service_unavailable: 422,
  slot_unavailable: 422,
  slot_taken: 409,
  invalid_transition: 409,
  act_incomplete: 422,
  act_not_confirmed: 422,
  invalid_photo: 422,
  photo_required: 422,
  item_unavailable: 409,
  already_decided: 409,
  unpriced_items: 422,
  payment_mismatch: 422,
  discount_over_limit: 422,

  sku_taken: 409,
  barcode_taken: 409,
  insufficient_stock: 409,
};

export const errorBody = (code: ApiErrorCode, paths?: readonly string[]): ApiError => ({
  error: { code, ...(paths && paths.length > 0 && { paths: [...paths] }) },
});

/** Fastify's own client errors: malformed JSON, a body too large, an unsupported content type. */
function clientErrorCode(status: number): ApiErrorCode | undefined {
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 400 && status < 500) return 'validation';
  return undefined;
}

const statusOf = (error: unknown): number | undefined =>
  typeof error === 'object' && error !== null && 'statusCode' in error
    ? Number(error.statusCode)
    : undefined;

/**
 * Every error leaves the server as `{ error: { code } }`. An AppError keeps its code; anything
 * else is a bug: it is logged with the route pattern (never the URL, whose query may hold a phone
 * number) and answered as `internal`.
 */
export function registerErrorHandling(app: FastifyInstance, logger: Logger): void {
  app.setErrorHandler((error, request, reply) => {
    if (isAppError(error)) {
      return reply
        .code(APP_ERROR_STATUS[error.code])
        .send(errorBody(error.code, error.details?.paths));
    }
    const status = statusOf(error);
    const clientCode = status === undefined ? undefined : clientErrorCode(status);
    if (status !== undefined && clientCode) return reply.code(status).send(errorBody(clientCode));

    logger.error(
      { err: error, method: request.method, route: request.routeOptions.url },
      'http request failed',
    );
    return reply.code(500).send(errorBody('internal'));
  });

  app.setNotFoundHandler((_request, reply) => reply.code(404).send(errorBody('not_found')));
}
