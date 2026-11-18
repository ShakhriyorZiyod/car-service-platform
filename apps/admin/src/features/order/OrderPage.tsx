import type { AdminOrder } from '@cs/shared';
import { formatDateLong, formatMoney, formatPhone } from '@cs/shared/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { call } from '../../api';
import { useLang, useT } from '../../i18n';
import { apiMessage } from '../../lib/errors';
import { ORDERS_KEY, POLL_MS, SCHEDULE_KEY, TODAY_KEY, orderKey } from '../../lib/keys';
import { Button } from '../../ui/Button';
import { CallActions } from '../../ui/CallActions';
import { Dialog } from '../../ui/Dialog';
import { Notice } from '../../ui/Notice';
import { PlateChip } from '../../ui/PlateChip';
import { ReasonDialog } from '../../ui/ReasonDialog';
import { StatusChip } from '../../ui/StatusChip';
import { EditItemsDialog } from './EditItemsDialog';
import { WorkCards } from './WorkCards';
import { RescheduleDialog } from './RescheduleDialog';
import './order.css';

type Dialogs = 'items' | 'reschedule' | 'cancel' | 'no_show' | null;

/** One order: who, what, when, the calls and the steps, and what the staff may do with it. */
export function OrderPage() {
  const t = useT();
  const { id = '' } = useParams();
  const order = useQuery({
    queryKey: orderKey(id),
    queryFn: () => call('admin.order', { params: { id } }),
    refetchInterval: POLL_MS,
  });

  return (
    <section className="order">
      <Link className="back-link" to="/orders">
        <ArrowLeft size={16} aria-hidden="true" />
        {t.order.back}
      </Link>
      {order.isError && <Notice tone="danger">{apiMessage(order.error, t)}</Notice>}
      {order.data && <OrderView order={order.data} />}
    </section>
  );
}

function OrderView({ order }: { order: AdminOrder }) {
  const t = useT();
  const lang = useLang();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Dialogs>(null);

  /** The order came back changed: show it, and refresh what lists it. */
  const refresh = async (updated?: AdminOrder) => {
    if (updated) queryClient.setQueryData(orderKey(order.id), updated);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ORDERS_KEY }),
      queryClient.invalidateQueries({ queryKey: TODAY_KEY }),
      queryClient.invalidateQueries({ queryKey: SCHEDULE_KEY }),
      queryClient.invalidateQueries({ queryKey: orderKey(order.id) }),
    ]);
  };
  const close = () => setDialog(null);

  const cancel = useMutation({
    mutationFn: (input: { reasonId: string; note: string | null }) =>
      call('admin.cancelOrder', {
        params: { id: order.id },
        body: { reasonId: input.reasonId, ...(input.note && { note: input.note }) },
      }),
    onSuccess: async (updated) => {
      close();
      await refresh(updated);
    },
    onError: () => refresh(),
  });
  const noShow = useMutation({
    mutationFn: () => call('admin.noShow', { params: { id: order.id } }),
    onSuccess: async (updated) => {
      close();
      await refresh(updated);
    },
    onError: () => refresh(),
  });

  const nameOf = (item: { nameUz: string; nameRu: string }) =>
    lang === 'ru' ? item.nameRu : item.nameUz;
  const sameDay = order.endsAt.date === order.startsAt.date;
  const when = `${formatDateLong(order.startsAt.date, lang)}, ${order.startsAt.time} – ${
    sameDay ? '' : `${formatDateLong(order.endsAt.date, lang)}, `
  }${order.endsAt.time}`;
  const { actions } = order;

  return (
    <>
      <header className="order__head">
        <div className="order__title">
          <h1 className="page-title">{t.order.title(order.number)}</h1>
          <StatusChip status={order.status} />
          <span className="chip">{t.source[order.source]}</span>
        </div>
        <div className="order__actions">
          {(actions.canCheckout || order.status === 'completed') && (
            <Link
              className={actions.canCheckout ? 'btn btn--primary' : 'btn btn--secondary'}
              to={`/orders/${order.id}/handover`}
            >
              {actions.canCheckout ? t.order.handover : t.order.payment}
            </Link>
          )}
          {actions.canEditItems && (
            <Button variant="secondary" onClick={() => setDialog('items')}>
              {t.order.actions.edit}
            </Button>
          )}
          {actions.canReschedule && (
            <Button variant="secondary" onClick={() => setDialog('reschedule')}>
              {t.order.actions.reschedule}
            </Button>
          )}
          {actions.canNoShow && (
            <Button variant="secondary" onClick={() => setDialog('no_show')}>
              {t.order.actions.noShow}
            </Button>
          )}
          {actions.canCancel && (
            <Button variant="secondary" className="btn--danger" onClick={() => setDialog('cancel')}>
              {t.order.actions.cancel}
            </Button>
          )}
        </div>
      </header>

      {order.status === 'new' && (
        <section className="card order__call">
          {order.waitingMin !== null && (
            <p className={order.callWarn ? 'order__waiting is-warn' : 'order__waiting'}>
              {t.orders.waitingFull(order.waitingMin)}
            </p>
          )}
          {order.holdUntil && (
            <p className="muted">
              {t.orders.holdUntil(
                `${order.holdUntil.date.slice(8)}.${order.holdUntil.date.slice(5, 7)} ${order.holdUntil.time}`,
              )}
            </p>
          )}
          <CallActions order={order} />
        </section>
      )}
      {order.rescheduleRequested && <Notice tone="warning">{t.order.rescheduleRequested}</Notice>}
      {order.cancelReason && (
        <Notice tone="danger">
          {t.order.cancelledBecause(lang === 'ru' ? order.cancelReason.ru : order.cancelReason.uz)}
        </Notice>
      )}

      <div className="order__grid">
        <div className="order__main">
          <section className="card order__panel">
            <dl className="facts">
              <div>
                <dt>{t.order.client}</dt>
                <dd>
                  <Link className="table__link" to={`/clients/${order.client.id}`}>
                    {order.client.fullName}
                  </Link>
                  {order.client.phone && (
                    <>
                      {' · '}
                      <a className="table__link num" href={`tel:${order.client.phone}`}>
                        {formatPhone(order.client.phone)}
                      </a>
                    </>
                  )}
                  {!order.client.hasTelegram && (
                    <p className="muted order__note">{t.order.noTelegram}</p>
                  )}
                </dd>
              </div>
              <div>
                <dt>{t.order.car}</dt>
                <dd className="order__car">
                  {order.car.label} <PlateChip plate={order.car.plate} />
                </dd>
              </div>
              <div>
                <dt>{t.order.time}</dt>
                <dd>{when}</dd>
              </div>
              <div>
                <dt>{t.order.box}</dt>
                <dd>{order.boxName ?? t.common.none}</dd>
              </div>
              {order.comment && (
                <div>
                  <dt>{t.order.comment}</dt>
                  <dd>{order.comment}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="card order__panel">
            <h2 className="section-title">{t.order.items}</h2>
            <table className="table">
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {nameOf(item)}
                      <span className="muted order__type">
                        {' '}
                        · {lang === 'ru' ? item.typeNameRu : item.typeNameUz}
                      </span>
                      {item.comment && <p className="muted order__note">{item.comment}</p>}
                      {(item.kind === 'extra' || item.progress) && (
                        <p className="order__note order__badges">
                          {item.kind === 'extra' && (
                            <span className="chip chip--warning">{t.work.extras.title}</span>
                          )}
                          {item.approval !== 'not_required' && (
                            <span className="chip">{t.itemApproval[item.approval]}</span>
                          )}
                          {item.progress && (
                            <span className="chip">{t.zoneProgress[item.progress]}</span>
                          )}
                        </p>
                      )}
                    </td>
                    <td className="table__num num">
                      {item.price === null ? t.order.toAgree : formatMoney(item.price, lang)}
                    </td>
                  </tr>
                ))}
                {order.discount && (
                  <tr>
                    <td className="muted">
                      {t.order.discount}
                      {order.discount.reason && ` · ${order.discount.reason}`}
                      {order.discount.percent !== null && ` · ${order.discount.percent}%`}
                    </td>
                    <td className="table__num num">−{formatMoney(order.discount.amount, lang)}</td>
                  </tr>
                )}
                <tr className="table__total">
                  <td>{t.order.total}</td>
                  <td className="table__num num">{formatMoney(order.total, lang)}</td>
                </tr>
              </tbody>
            </table>
            {order.unpricedCount > 0 && (
              <p className="muted">{t.order.unpricedNote(order.unpricedCount)}</p>
            )}
          </section>

          <WorkCards order={order} />
        </div>

        <aside className="order__side">
          <section className="card order__panel">
            <h2 className="section-title">{t.order.calls}</h2>
            {order.calls.length === 0 && <p className="muted">{t.order.noCalls}</p>}
            <ul className="timeline">
              {order.calls.map((entry) => (
                <li key={entry.id}>
                  <span className="timeline__what">{t.order.callOutcome[entry.outcome]}</span>
                  <span className="muted">
                    {entry.at.date.slice(8)}.{entry.at.date.slice(5, 7)} {entry.at.time} ·{' '}
                    {entry.adminName}
                  </span>
                  {entry.note && <span className="muted">{entry.note}</span>}
                </li>
              ))}
            </ul>
          </section>
          <section className="card order__panel">
            <h2 className="section-title">{t.order.history}</h2>
            <ul className="timeline">
              {order.history.map((step, index) => (
                <li key={`${step.status}-${index}`}>
                  <span className="timeline__what">
                    <StatusChip status={step.status} />
                  </span>
                  <span className="muted">
                    {step.at.date.slice(8)}.{step.at.date.slice(5, 7)} {step.at.time}
                  </span>
                </li>
              ))}
            </ul>
            <p className="muted order__created">
              {t.order.createdAt(
                `${order.createdAt.date.slice(8)}.${order.createdAt.date.slice(5, 7)} ${order.createdAt.time}`,
              )}
            </p>
          </section>
        </aside>
      </div>

      {dialog === 'items' && (
        <EditItemsDialog
          order={order}
          onClose={close}
          onSaved={(updated) => void refresh(updated)}
        />
      )}
      {dialog === 'reschedule' && (
        <RescheduleDialog
          order={order}
          onClose={close}
          onSaved={(updated) => void refresh(updated)}
        />
      )}
      {dialog === 'cancel' && (
        <ReasonDialog
          title={t.order.cancel.title}
          submitLabel={t.order.cancel.submit}
          pending={cancel.isPending}
          error={cancel.error}
          onClose={() => {
            close();
            cancel.reset();
          }}
          onSubmit={(value) => cancel.mutate(value)}
        />
      )}
      {dialog === 'no_show' && (
        <Dialog title={t.order.noShow.title} onClose={close}>
          <div className="form-stack">
            <p>{t.order.noShow.text}</p>
            {noShow.isError && <Notice tone="danger">{apiMessage(noShow.error, t)}</Notice>}
            <div className="dialog__actions">
              <Button variant="secondary" onClick={close}>
                {t.form.cancel}
              </Button>
              <Button busy={noShow.isPending} onClick={() => noShow.mutate()}>
                {t.order.noShow.submit}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
