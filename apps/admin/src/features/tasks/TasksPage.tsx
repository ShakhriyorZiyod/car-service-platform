import { ADMIN_TASK_TABS, type AdminTaskTab } from '@cs/shared/vocabulary';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { call } from '../../api';
import { useLang, useT } from '../../i18n';
import { genericMessage } from '../../lib/errors';
import { POLL_MS, TASKS_KEY } from '../../lib/keys';
import { Notice } from '../../ui/Notice';
import { PlateChip } from '../../ui/PlateChip';
import { TaskChip } from '../../ui/TaskChip';
import './tasks.css';

/** "Ustalar hisobotlari" (design A3): the reports to check, the work in progress, the finished. */
export function TasksPage() {
  const t = useT();
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: AdminTaskTab = (ADMIN_TASK_TABS as readonly string[]).includes(requested ?? '')
    ? (requested as AdminTaskTab)
    : 'review';

  const list = useQuery({
    queryKey: [...TASKS_KEY, tab],
    queryFn: () => call('admin.tasks', { query: { tab } }),
    refetchInterval: POLL_MS,
  });
  // The count of reports waiting is the first thing the admin looks for.
  const review = useQuery({
    queryKey: [...TASKS_KEY, 'review'],
    queryFn: () => call('admin.tasks', { query: { tab: 'review' } }),
    refetchInterval: POLL_MS,
  });
  const items = list.data?.items ?? [];

  return (
    <section className="tasks">
      <h1 className="page-title">{t.tasks.title}</h1>
      <div className="pills">
        {ADMIN_TASK_TABS.map((value) => (
          <button
            key={value}
            type="button"
            className={tab === value ? 'pill is-active' : 'pill'}
            onClick={() => setParams({ tab: value }, { replace: true })}
          >
            {t.tasks.tabs[value]}
            {value === 'review' && (review.data?.items.length ?? 0) > 0 && (
              <span className="zones__count num">{review.data?.items.length}</span>
            )}
          </button>
        ))}
      </div>

      {list.isError && <Notice tone="danger">{genericMessage(list.error, t)}</Notice>}
      {list.isSuccess && items.length === 0 && <p className="muted">{t.tasks.empty[tab]}</p>}
      <div className="tasks__list">
        {items.map((task) => (
          <Link key={task.id} className="card task-card" to={`/tasks/${task.id}`}>
            <header className="task-card__head">
              <strong className="num">{t.tasks.order(task.orderNumber)}</strong>
              <TaskChip status={task.status} />
              {task.reworkCount > 0 && (
                <span className="chip chip--warning">{t.tasks.attempt(task.reworkCount + 1)}</span>
              )}
            </header>
            <div className="task-card__car">
              <span>{task.car.label}</span>
              <PlateChip plate={task.car.plate} />
            </div>
            <p className="muted task-card__items">
              {task.items.map((item) => (lang === 'ru' ? item.nameRu : item.nameUz)).join(', ')}
            </p>
            <p className="task-card__who">
              {t.tasks.master}: {task.master.fullName}
              {task.submittedAt && (
                <span className="muted">
                  {' · '}
                  {t.tasks.submitted(
                    `${task.submittedAt.date.slice(8)}.${task.submittedAt.date.slice(5, 7)} ${task.submittedAt.time}`,
                  )}
                </span>
              )}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
