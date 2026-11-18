import type { Me } from '@cs/shared';
import type { Permission } from '@cs/shared/vocabulary';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, use, type ReactNode } from 'react';
import { ApiRequestError, call } from '../api';

/**
 * Who is signed in. The panel asks `auth.me` once; a 401 there or from any later call means the
 * session is gone, and the sign-in screen takes over (see main.tsx).
 */

export const ME_KEY = ['me'] as const;

export function useMeQuery() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await call('auth.me');
      } catch (error) {
        // Not signed in is an answer, not a failure.
        if (error instanceof ApiRequestError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
  });
}

const MeContext = createContext<Me | null>(null);

export function MeProvider({ me, children }: { me: Me; children: ReactNode }) {
  return <MeContext value={me}>{children}</MeContext>;
}

export function useMe(): Me {
  const me = use(MeContext);
  if (!me) throw new Error('useMe must be used inside MeProvider');
  return me;
}

/** Hides what the role may not do; the API refuses it anyway. */
export function useCan(): (permission: Permission) => boolean {
  const me = useMe();
  return (permission) => me.permissions.includes(permission);
}

export function useSetMe(): (me: Me | null) => void {
  const queryClient = useQueryClient();
  return (me) => queryClient.setQueryData(ME_KEY, me);
}
