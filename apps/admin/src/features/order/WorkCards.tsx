import type { AdminOrder } from '@cs/shared';
import { formatMoney } from '@cs/shared/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { call } from '../../api';
import { useCan } from '../../auth/session';
import { useLang, useT } from '../../i18n';
import { apiMessage } from '../../lib/errors';
import {
  ORDERS_KEY,
  POLL_MS,
  SCHEDULE_KEY,
  TASKS_KEY,
  TODAY_KEY,
  actKey,
  orderKey,
} from '../../lib/keys';
import { Button } from '../../ui/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { Notice } from '../../ui/Notice';
import { TaskChip } from '../../ui/TaskChip';
import { AddExtraDialog } from './AddExtraDialog';
import { GiveTaskDialog } from './GiveTaskDialog';

/** Reception, the masters' tasks and extra work, under the order's zones (PLAN 9.2–9.4). */
export function WorkCards({ order }: { order: AdminOrder }) {
  const can = useCan();
  const working =
    order.status === 'in_work' ||
    order.status === 'ready_for_pickup' ||
    order.status === 'completed';
  return (
    <>
      {(order.status === 'confirmed' || working) && <ActCard order={order} />}
      {can('tasks.review') && working && <TasksCard order={order} />}
      {(order.status === 'in_work' || order.items.some((item) => item.kind === 'extra')) && (
        <ExtrasCard order={order} />
      )}
    </>
  );
}

function useRefreshOrder(orderId: string) {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orderKey(orderId) }),
      queryClient.invalidateQueries({ queryKey: actKey(orderId) }),
      queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
      queryClient.invalidateQueries({ queryKey: ORDERS_KEY }),
      queryClient.invalidateQueries({ queryKey: TODAY_KEY }),
      queryClient.invalidateQueries({ queryKey: SCHEDULE_KEY }),
    ]);
  };
}

function ActCard({ order }: { order: AdminOrder }) {
  const t = useT();
  const can = useCan();
  const refresh = useRefreshOrder(order.id);
  const act = useQuery({
    queryKey: actKey(order.id),
    queryFn: () => call('admin.act', { params: { id: order.id } }),
    refetchInterval: POLL_MS,
  });
  const start = useMutation({
    mutationFn: () => call('admin.startWork', { params: { id: order.id } }),
    onSuccess: () => refresh(),
    onError: () => refresh(),
  });
  const state = act.data;
  const shown = state?.act ?? null;
  return (
    <section className="card order__panel">
      <header className="order__card-head">
        <h2 className="section-title">{t.work.act.title}</h2>
        {shown && (
          <span className={`chip act-chip--${shown.status}`}>{t.actStatus[shown.status]}</span>
        )}
        <Link className="table__link" to={`/orders/${order.id}/act`}>
          {t.work.act.open}
        </Link>
      </header>
      {shown ? (
        <p className="muted">
          {shown.mileageKm !== null && `${shown.mileageKm} km`}
          {shown.fuelLevel !== null && ` · ${t.reception.fuelLevels[shown.fuelLevel] ?? ''}`}
          {` · ${t.reception.defect(shown.defects.length).replace(/\s\d+$/, '')}: ${shown.defects.length}`}
        </p>
      ) : (
        <p className="muted">{t.work.act.none}</p>
      )}
      {can('reception.write') && state?.canStartWork && (
        <>
          <Notice tone="success">{t.work.act.startHint}</Notice>
          {start.isError && <Notice tone="danger">{apiMessage(start.error, t)}</Notice>}
          <div>
            <Button busy={start.isPending} onClick={() => start.mutate()}>
              {t.work.act.start}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function TasksCard({ order }: { order: AdminOrder }) {
  const t = useT();
  const lang = useLang();
  const [giving, setGiving] = useState(false);
  const tasks = useQuery({
    queryKey: [...TASKS_KEY, 'order', order.id],
    queryFn: () => call('admin.tasks', { query: { orderId: order.id } }),
    refetchInterval: POLL_MS,
  });
  const free = order.items.filter(
    (item) =>
      item.taskId === null && (item.approval === 'not_required' || item.approval === 'approved'),
  );
  return (
    <section className="card order__panel">
      <header className="order__card-head">
        <h2 className="section-title">{t.work.tasks.title}</h2>
        {order.status === 'in_work' && free.length > 0 && (
          <Button variant="secondary" onClick={() => setGiving(true)}>
            {t.work.tasks.give}
          </Button>
        )}
      </header>
      {tasks.data && tasks.data.items.length === 0 && <p className="muted">{t.work.tasks.none}</p>}
      <ul className="timeline">
        {tasks.data?.items.map((task) => (
          <li key={task.id}>
            <span className="timeline__what">
              <TaskChip status={task.status} />{' '}
              <Link className="table__link" to={`/tasks/${task.id}`}>
                {task.master.fullName}
              </Link>
            </span>
            <span className="muted">
              {task.items.map((item) => (lang === 'ru' ? item.nameRu : item.nameUz)).join(', ')}
            </span>
          </li>
        ))}
      </ul>
      {giving && <GiveTaskDialog order={order} free={free} onClose={() => setGiving(false)} />}
    </section>
  );
}

function ExtrasCard({ order }: { order: AdminOrder }) {
  const t = useT();
  const lang = useLang();
  const can = useCan();
  const refresh = useRefreshOrder(order.id);
  const [adding, setAdding] = useState(false);
  const extras = order.items.filter((item) => item.kind === 'extra');
  const [deciding, setDeciding] = useState<{
    itemId: string;
    decision: 'approved' | 'rejected';
    name: string;
    price: number | null;
  } | null>(null);

  const decide = useMutation({
    mutationFn: (input: { itemId: string; decision: 'approved' | 'rejected' }) =>
      call('admin.decideExtraItem', {
        params: { id: order.id, itemId: input.itemId },
        body: { decision: input.decision },
      }),
    onSuccess: () => setDeciding(null),
    onSettled: () => refresh(),
  });
  return (
    <section className="card order__panel">
      <header className="order__card-head">
        <h2 className="section-title">{t.work.extras.title}</h2>
        {can('orders.write') && order.status === 'in_work' && (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            {t.work.extras.add}
          </Button>
        )}
      </header>
      {extras.length === 0 && <p className="muted">{t.work.extras.none}</p>}
      <ul className="timeline">
        {extras.map((item) => (
          <li key={item.id}>
            <span className="timeline__what">
              {lang === 'ru' ? item.nameRu : item.nameUz}
              {' · '}
              <span className="num">
                {item.price === null ? t.order.toAgree : formatMoney(item.price, lang)}
              </span>
            </span>
            <span className="muted">{t.itemApproval[item.approval]}</span>
            {item.approval === 'pending' && can('orders.write') && (
              <span className="order__decide">
                <Button
                  variant="secondary"
                  onClick={() =>
                    setDeciding({
                      itemId: item.id,
                      decision: 'approved',
                      name: lang === 'ru' ? item.nameRu : item.nameUz,
                      price: item.price,
                    })
                  }
                >
                  {t.work.extras.approve}
                </Button>
                <Button
                  variant="secondary"
                  className="btn--danger"
                  onClick={() =>
                    setDeciding({
                      itemId: item.id,
                      decision: 'rejected',
                      name: lang === 'ru' ? item.nameRu : item.nameUz,
                      price: item.price,
                    })
                  }
                >
                  {t.work.extras.reject}
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {deciding && (
        <ConfirmDialog
          title={t.confirm.extraTitle[deciding.decision]}
          confirmLabel={t.confirm.extraSubmit[deciding.decision]}
          danger={deciding.decision === 'rejected'}
          pending={decide.isPending}
          error={decide.error}
          onConfirm={() => decide.mutate({ itemId: deciding.itemId, decision: deciding.decision })}
          onClose={() => {
            setDeciding(null);
            decide.reset();
          }}
        >
          <p>
            {t.confirm.extraText(
              deciding.name,
              deciding.price === null ? t.order.toAgree : formatMoney(deciding.price, lang),
            )}
          </p>
        </ConfirmDialog>
      )}
      {adding && <AddExtraDialog order={order} onClose={() => setAdding(false)} />}
    </section>
  );
}
