import type { AdminOrder } from '@cs/shared';
import type { OrderStatus } from '@cs/shared/vocabulary';
import { useQuery } from '@tanstack/react-query';
import { AlarmClock, Plus, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { call } from '../../api';
import { useCan } from '../../auth/session';
import { useLang, useT } from '../../i18n';
import { genericMessage } from '../../lib/errors';
import { CATALOG_KEY, ORDERS_KEY, POLL_MS } from '../../lib/keys';
import { CallActions } from '../../ui/CallActions';
import { Notice } from '../../ui/Notice';
import { PlateChip } from '../../ui/PlateChip';
import './orders.css';

const COLUMNS = [
  'new',
  'confirmed',
  'in_work',
  'ready_for_pickup',
] as const satisfies readonly OrderStatus[];

/** "Arizalar" (design A1): the board of orders in progress, with the timer and the call buttons. */
export function OrdersPage() {
  const t = useT();
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const typeId = params.get('type') ?? '';

  const orders = useQuery({
    queryKey: [...ORDERS_KEY, 'board', q, typeId],
    queryFn: () =>
      call('admin.orders', {
        query: { ...(q && { q }), ...(typeId && { serviceTypeId: typeId }) },
      }),
    refetchInterval: POLL_MS,
  });
  const catalog = useQuery({
    queryKey: CATALOG_KEY,
    queryFn: () => call('admin.catalog'),
    staleTime: 5 * 60_000,
  });
  const lang = useLang();

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const items = orders.data?.items ?? [];
  const late = items.filter((order) => order.status === 'new' && order.callWarn);

  return (
    <section className="orders">
      <header className="orders__head">
        <h1 className="page-title">{t.orders.title}</h1>
        {can('orders.write') && (
          <Link className="btn btn--primary" to="/orders/new">
            <Plus size={16} aria-hidden="true" />
            {t.orders.add}
          </Link>
        )}
      </header>

      <div className="pills">
        <button
          type="button"
          className={typeId === '' ? 'pill is-active' : 'pill'}
          onClick={() => setParam('type', '')}
        >
          {t.orders.allKinds}
        </button>
        {catalog.data?.serviceTypes.map((type) => (
          <button
            key={type.id}
            type="button"
            className={typeId === type.id ? 'pill is-active' : 'pill'}
            onClick={() => setParam('type', type.id)}
          >
            {lang === 'ru' ? type.nameRu : type.nameUz}
          </button>
        ))}
        {q && (
          <button type="button" className="pill is-hidden" onClick={() => setParam('q', '')}>
            {t.orders.searching(q)} <X size={14} aria-hidden="true" />
            <span className="visually-hidden">{t.orders.clearSearch}</span>
          </button>
        )}
      </div>

      {orders.isError && <Notice tone="danger">{genericMessage(orders.error, t)}</Notice>}
      {late.map((order) => (
        <p key={order.id} className="alert-banner" role="alert">
          <AlarmClock size={16} aria-hidden="true" />
          <Link to={`/orders/${order.id}`}>
            {t.orders.alert(order.number, order.waitingMin ?? 0)}
          </Link>
        </p>
      ))}
      {orders.isSuccess && items.length === 0 && q && <p className="muted">{t.orders.nothing}</p>}

      <div className="board">
        {COLUMNS.map((status) => {
          const column = items
            .filter((order) => order.status === status)
            .sort((a, b) =>
              status === 'new'
                ? a.createdAt.at.localeCompare(b.createdAt.at)
                : a.startsAt.at.localeCompare(b.startsAt.at),
            );
          return (
            <section key={status} className={`board__column board__column--${status}`}>
              <h2 className="board__title">
                <span className="board__square" aria-hidden="true" />
                {t.status[status]}
                <span className="board__count num">{column.length}</span>
              </h2>
              {column.length === 0 && <p className="muted board__empty">{t.orders.columnEmpty}</p>}
              {column.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function OrderCard({ order }: { order: AdminOrder }) {
  const t = useT();
  const lang = useLang();
  const names = order.items.map((item) => (lang === 'ru' ? item.nameRu : item.nameUz)).join(', ');
  const waiting = order.status === 'new' && order.waitingMin !== null;
  return (
    <article className={order.callWarn ? 'order-card order-card--warn' : 'order-card'}>
      <header className="order-card__head">
        <Link className="order-card__number num" to={`/orders/${order.id}`}>
          №{order.number}
        </Link>
        <span className="chip">{t.source[order.source]}</span>
        {waiting ? (
          <span
            className={order.callWarn ? 'order-card__timer is-warn num' : 'order-card__timer num'}
            title={t.orders.waitingFull(order.waitingMin ?? 0)}
          >
            {t.orders.waiting(order.waitingMin ?? 0)}
          </span>
        ) : (
          <span className="order-card__timer num">
            {order.startsAt.time}
            <span className="muted order-card__date"> {formatShortDate(order.startsAt.date)}</span>
          </span>
        )}
      </header>
      <div className="order-card__car">
        <span>{order.car.label}</span>
        <PlateChip plate={order.car.plate} />
      </div>
      <p className="order-card__items muted">{names}</p>
      {waiting && (
        <p className="order-card__visit num">
          {t.orders.visit(`${formatShortDate(order.startsAt.date)} ${order.startsAt.time}`)}
        </p>
      )}
      <p className="order-card__who">
        {order.client.fullName}
        {order.boxName && <span className="muted"> · {order.boxName}</span>}
      </p>
      {(order.rescheduleRequested || !order.client.hasTelegram) && (
        <p className="order-card__flags">
          {order.rescheduleRequested && (
            <span className="chip chip--warning">{t.orders.rescheduleRequested}</span>
          )}
          {!order.client.hasTelegram && <span className="chip">{t.orders.noTelegram}</span>}
        </p>
      )}
      {order.status === 'new' && order.holdUntil && (
        <p className="order-card__hold muted">
          {t.orders.holdUntil(`${formatShortDate(order.holdUntil.date)} ${order.holdUntil.time}`)}
        </p>
      )}
      <CallActions order={order} compact />
    </article>
  );
}

/** "2026-10-30" → "30.10". */
const formatShortDate = (date: string) => `${date.slice(8)}.${date.slice(5, 7)}`;
