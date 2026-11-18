import type { MasterTaskSummary } from '@cs/shared';
import { formatDuration } from '@cs/shared/format';
import { MASTER_TASK_TABS, type MasterTaskTab } from '@cs/shared/vocabulary';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { useApi } from '../../../bootstrap';
import { useLang, useT } from '../../../i18n';
import { Button } from '../../../ui/Button';
import { EmptyState, PlateChip, Skeleton } from '../../../ui/client-parts';
import { Notice } from '../../../ui/Notice';
import { errorText, taskKey, taskListKey, useTasks } from '../data';
import { MasterTimer } from '../../../ui/MasterTimer';

/** U1: the master's tasks: today, to redo, handed in (design 7.2). */
export function TasksScreen({
  tab,
  onTab,
  onOpen,
}: {
  tab: MasterTaskTab;
  onTab: (tab: MasterTaskTab) => void;
  onOpen: (taskId: string) => void;
}) {
  const t = useT().master;
  // All three are read: the counts of the first two are on the tabs.
  const lists = {
    today: useTasks('today'),
    rework: useTasks('rework'),
    done: useTasks('done'),
  } as const;
  const current = lists[tab];
  const items = current.data?.items ?? [];

  return (
    <>
      <nav className="master-tabs" aria-label={t.nav.tasks}>
        {MASTER_TASK_TABS.map((value) => {
          const count = lists[value].data?.items.length ?? 0;
          return (
            <button
              key={value}
              type="button"
              className={value === tab ? 'master-tabs__tab is-active' : 'master-tabs__tab'}
              onClick={() => onTab(value)}
            >
              {t.tabs[value]}
              {value !== 'done' && count > 0 && (
                <span className="master-tabs__count num">{count}</span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="master-list">
        {current.isPending && <Skeleton />}
        {current.isError && <Notice tone="danger">{errorText(t, current.error)}</Notice>}
        {current.isSuccess && items.length === 0 && (
          <EmptyState icon={<ClipboardList size={28} />} title={t.empty[tab]} />
        )}
        {items.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            updatedAt={current.dataUpdatedAt}
            onOpen={() => onOpen(task.id)}
          />
        ))}
      </div>
    </>
  );
}

function TaskCard({
  task,
  updatedAt,
  onOpen,
}: {
  task: MasterTaskSummary;
  updatedAt: number;
  onOpen: () => void;
}) {
  const t = useT().master;
  const lang = useLang();
  const api = useApi();
  const queryClient = useQueryClient();
  const start = useMutation({
    mutationFn: () => api.call('master.startTask', { params: { id: task.id } }),
    onSuccess: async (started) => {
      queryClient.setQueryData(taskKey(task.id), started);
      await Promise.all(
        MASTER_TASK_TABS.map((value) =>
          queryClient.invalidateQueries({ queryKey: taskListKey(value) }),
        ),
      );
      onOpen();
    },
  });
  const names = task.items.map((item) => (lang === 'ru' ? item.nameRu : item.nameUz)).join(', ');
  const rework = task.status === 'rework';

  return (
    <article className={rework ? 'card master-card master-card--rework' : 'card master-card'}>
      <button type="button" className="master-card__body" onClick={onOpen}>
        <span className="master-card__top">
          <span className={`master-chip master-chip--${task.status}`}>{t.status[task.status]}</span>
          {task.status === 'in_progress' && task.elapsedSec !== null ? (
            <MasterTimer
              key={`${task.id}-${updatedAt}`}
              elapsedSec={task.elapsedSec}
              normMinutes={task.normMinutes}
            />
          ) : (
            <span className="secondary num">
              {[task.boxName, t.norm(formatDuration(task.normMinutes, lang))]
                .filter(Boolean)
                .join(', ')}
            </span>
          )}
        </span>
        <span className="master-card__car">
          <strong>{task.car.label}</strong>
          <PlateChip plate={task.car.plate} />
        </span>
        <span className="master-card__items">{names}</span>
        {rework && task.lastRemark && (
          <span className="master-card__remark">{task.lastRemark}</span>
        )}
      </button>
      {task.status === 'assigned' && (
        <Button busy={start.isPending} onClick={() => start.mutate()}>
          {t.start}
        </Button>
      )}
      {task.status === 'in_progress' && (
        <Button className="button--dark" onClick={onOpen}>
          {t.submit}
        </Button>
      )}
      {rework && <Button onClick={onOpen}>{t.open}</Button>}
      {start.isError && <p className="master-error">{errorText(t, start.error)}</p>}
    </article>
  );
}
