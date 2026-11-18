import type { Bootstrap } from '@cs/shared';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, use, useMemo, useState, type ReactNode } from 'react';
import { ApiRequestError, createApiClient, type ApiClient } from './api';

/**
 * The session of one Mini App visit: the API client signed with this launch's init data, and the
 * first answer (`tma.bootstrap`), which says who the user is and which part of the app opens.
 */

const ApiContext = createContext<ApiClient | null>(null);

export const BOOTSTRAP_KEY = ['bootstrap'] as const;

/** Only network trouble is worth retrying; the server's answers will not change by themselves. */
const retryOnNetworkError = (failureCount: number, error: unknown): boolean =>
  error instanceof ApiRequestError && error.code === 'network' && failureCount < 2;

export function SessionProvider({ initData, children }: { initData: string; children: ReactNode }) {
  const api = useMemo(() => createApiClient(initData), [initData]);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: retryOnNetworkError, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <ApiContext value={api}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiContext>
  );
}

export function useApi(): ApiClient {
  const api = use(ApiContext);
  if (!api) throw new Error('useApi must be used inside SessionProvider');
  return api;
}

export function useBootstrap() {
  const api = useApi();
  return useQuery({ queryKey: BOOTSTRAP_KEY, queryFn: () => api.call('tma.bootstrap') });
}

/** Endpoints that change the user answer with a fresh bootstrap; this stores it. */
export function useSetBootstrap(): (bootstrap: Bootstrap) => void {
  const queryClient = useQueryClient();
  return (bootstrap) => queryClient.setQueryData(BOOTSTRAP_KEY, bootstrap);
}
