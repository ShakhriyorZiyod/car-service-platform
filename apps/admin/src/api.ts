import type { ApiError, ApiErrorCode, RequestOf, ResponseOf } from '@cs/shared';
import { ROUTES, type RouteName } from '@cs/shared/routes';

/**
 * The panel's API client, typed from the shared contract like the Mini App's. It authenticates
 * with the session cookie (stage 1), which the browser sends because the panel and the API share
 * one origin.
 */

export type ClientErrorCode = ApiErrorCode | 'network';

export class ApiRequestError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    readonly status: number,
    /** Which request fields failed validation, to mark them in a form. */
    readonly paths: readonly string[] = [],
  ) {
    super(`API request failed: ${code} (${status})`);
  }
}

type CallArgs<K extends RouteName> = keyof RequestOf<K> extends never ? [] : [input: RequestOf<K>];

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

export async function call<K extends RouteName>(
  name: K,
  ...args: CallArgs<K>
): Promise<ResponseOf<K>> {
  const { method, path } = ROUTES[name];
  const parts = (args[0] ?? {}) as RequestParts;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, parts), {
      method,
      credentials: 'same-origin',
      headers: parts.body !== undefined ? { 'content-type': 'application/json' } : {},
      ...(parts.body !== undefined && { body: JSON.stringify(parts.body) }),
    });
  } catch {
    throw new ApiRequestError('network', 0);
  }

  const json: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = (json as Partial<ApiError> | undefined)?.error;
    throw new ApiRequestError(error?.code ?? 'internal', response.status, error?.paths);
  }
  return json as ResponseOf<K>;
}
