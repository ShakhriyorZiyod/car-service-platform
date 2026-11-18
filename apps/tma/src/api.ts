import type { ApiError, ApiErrorCode, RequestOf, ResponseOf } from '@cs/shared';
import { INIT_DATA_AUTH_SCHEME, ROUTES, type RouteName } from '@cs/shared/routes';

/**
 * The whole API client: every endpoint goes through `call`, typed from the shared contract, so a
 * new endpoint needs no code here. Responses are trusted rather than parsed (the server checks
 * them against the contract outside production), which keeps zod out of the bundle.
 */

export type ClientErrorCode = ApiErrorCode | 'network';

export class ApiRequestError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    readonly status: number,
  ) {
    super(`API request failed: ${code} (${status})`);
  }
}

/** An endpoint with no input takes no second argument. */
type CallArgs<K extends RouteName> = keyof RequestOf<K> extends never ? [] : [input: RequestOf<K>];

export interface ApiClient {
  call<K extends RouteName>(name: K, ...args: CallArgs<K>): Promise<ResponseOf<K>>;
}

interface RequestParts {
  params?: Record<string, string | number>;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

function buildUrl(path: string, { params, query }: RequestParts): string {
  const withParams = path.replace(/:(\w+)/g, (_match, key: string) =>
    encodeURIComponent(String(params?.[key])),
  );
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `${withParams}?${encoded}` : withParams;
}

const errorCodeOf = (json: unknown): ApiErrorCode | undefined =>
  (json as Partial<ApiError> | undefined)?.error?.code;

export function createApiClient(initData: string): ApiClient {
  const authorization = `${INIT_DATA_AUTH_SCHEME} ${initData}`;

  return {
    async call<K extends RouteName>(name: K, ...args: CallArgs<K>): Promise<ResponseOf<K>> {
      const { method, path } = ROUTES[name];
      const parts = (args[0] ?? {}) as RequestParts;

      let response: Response;
      try {
        response = await fetch(buildUrl(path, parts), {
          method,
          headers: {
            authorization,
            ...(parts.body !== undefined && { 'content-type': 'application/json' }),
          },
          ...(parts.body !== undefined && { body: JSON.stringify(parts.body) }),
        });
      } catch {
        throw new ApiRequestError('network', 0);
      }

      const json: unknown = await response.json().catch(() => undefined);
      if (!response.ok) throw new ApiRequestError(errorCodeOf(json) ?? 'internal', response.status);
      return json as ResponseOf<K>;
    },
  };
}
