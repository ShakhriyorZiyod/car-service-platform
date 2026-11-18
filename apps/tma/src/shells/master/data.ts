import type { MasterTaskTab } from '@cs/shared/vocabulary';
import { useQuery } from '@tanstack/react-query';
import { ApiRequestError } from '../../api';
import { useApi } from '../../bootstrap';
import type { Texts } from '../../i18n';

/** What the master's screens read from the server: only their own tasks (docs/PLAN.md, section 8). */

export const taskListKey = (tab: MasterTaskTab) => ['master', 'tasks', tab] as const;
export const taskKey = (id: string) => ['master', 'task', id] as const;

/** The list is asked again now and then: the admin may send a task back or give a new one. */
export function useTasks(tab: MasterTaskTab) {
  const api = useApi();
  return useQuery({
    queryKey: taskListKey(tab),
    queryFn: () => api.call('master.tasks', { query: { tab } }),
    refetchInterval: 20_000,
  });
}

export function useTask(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: taskKey(id),
    queryFn: () => api.call('master.task', { params: { id } }),
    refetchInterval: 15_000,
  });
}

/** The words for an error the master can act on; anything unknown is the generic one. */
export function errorText(t: Texts['master'], error: unknown): string {
  const code = error instanceof ApiRequestError ? error.code : 'internal';
  return t.errors[code] ?? t.errors.generic ?? '';
}
