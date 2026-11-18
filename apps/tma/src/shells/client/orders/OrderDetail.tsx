import type { Order } from '@cs/shared';
import { formatDateLong, formatDuration, formatMoney } from '@cs/shared/format';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useApi } from '../../../bootstrap';
import { useLang, useT } from '../../../i18n';
import { useBack } from '../../../lib/back';
import { errorText, orderKey, pick, useCatalog, useOrder } from '../../../lib/client-data';
import { Button } from '../../../ui/Button';
import { PlateChip, ScreenHeader, Skeleton, StatusChip } from '../../../ui/client-parts';
import { Notice } from '../../../ui/Notice';
import { ActSection } from './ActSection';
import { ExtraApproval } from './ExtraApproval';
import { ResultSection } from './ResultSection';

/**
 * T6: one order. Its status and steps, the works with prices, the time, and what the client may
 * still do: cancel it with a reason, or ask the workshop to move the time. Which of these is
 * allowed comes from the server.
 */
export function OrderDetail({
  orderId,
  onBack,
  onBook,
}: {
  orderId: string;
  onBack: () => void;
  /** "Yana bron qilish" under a finished order (design T12). */
  onBook: () => void;
}) {
  const t = useT().client;
  const lang = useLang();
  const api = useApi();
  const queryClient = useQueryClient();
  const order = useOrder(orderId);
  const catalog = useCatalog();
  const [cancelling, setCancelling] = useState(false);
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  useBack(onBack);

  const refresh = async (updated: Order) => {
    queryClient.setQueryData(orderKey(orderId), updated);
    await queryClient.invalidateQueries({ queryKey: ['orders'] });
  };
  const cancel = useMutation({
    mutationFn: () =>
      api.call('client.cancelOrder', {
        params: { id: orderId },
        body: { reasonId: reasonId ?? '', note: note.trim() || null },
      }),
    onSuccess: async (updated) => {
      setCancelling(false);
      await refresh(updated);
    },
  });
  const reschedule = useMutation({
    mutationFn: () => api.call('client.requestReschedule', { params: { id: orderId } }),
    onSuccess: refresh,
  });

  const data = order.data;
  const reasons = catalog.data?.cancelReasons ?? [];
  const chosenReason = reasons.find((reason) => reason.id === reasonId);

  return (
    <section className={data?.status === 'completed' ? 'screen screen--with-bar' : 'screen'}>
      <ScreenHeader
        title={data ? t.orders.detailTitle(data.number) : t.common.loading}
        onBack={onBack}
        aside={data && <StatusChip status={data.status} />}
      />
      {order.isPending && <Skeleton />}
      {order.isError && <Notice tone="danger">{errorText(t, order.error)}</Notice>}
      {(cancel.isError || reschedule.isError) && (
        <Notice tone="danger">{errorText(t, cancel.error ?? reschedule.error)}</Notice>
      )}

      {data && (
        <>
          {data.holdUntil && (
            <Notice tone="info">
              {t.orders.holdUntil(
                `${formatDateLong(data.holdUntil.date, lang)}, ${data.holdUntil.time}`,
              )}
            </Notice>
          )}
          {data.rescheduleRequested && data.status !== 'cancelled' && (
            <Notice tone="warning">{t.orders.rescheduleSent}</Notice>
          )}

          {data.items
            .filter((item) => item.kind === 'extra' && item.approval === 'pending')
            .map((item) => (
              <ExtraApproval key={item.id} order={data} item={item} />
            ))}

          <div className="card summary">
            <div className="summary__row">
              <span className="secondary">{t.orders.when}</span>
              <span>
                {formatDateLong(data.startsAt.date, lang)}, {data.startsAt.time}
              </span>
            </div>
            <div className="summary__row">
              <span className="secondary">{t.orders.car}</span>
              <span>
                {data.car.label}
                <PlateChip plate={data.car.plate} />
              </span>
            </div>
            <ul className="summary__items">
              {data.items.map((item) => (
                <li
                  key={item.id}
                  className={item.approval === 'rejected' ? 'is-refused' : undefined}
                >
                  <span>
                    {pick(lang, { uz: item.typeNameUz, ru: item.typeNameRu })}:{' '}
                    {pick(lang, { uz: item.nameUz, ru: item.nameRu })}
                    <span className="secondary"> · {formatDuration(item.durationMin, lang)}</span>
                    {item.kind === 'extra' && (
                      <span className="item-badges">
                        <span className="item-badge">{t.orders.extra.badge}</span>
                        {item.approval === 'pending' && (
                          <span className="item-badge">{t.orders.extra.waiting}</span>
                        )}
                        {item.approval === 'rejected' && (
                          <span className="item-badge">{t.orders.extra.rejected}</span>
                        )}
                      </span>
                    )}
                    {item.progress && (
                      <span className={`zone-state zone-state--${item.progress}`}>
                        {t.orders.zoneProgress[item.progress]}
                      </span>
                    )}
                  </span>
                  <span className="num">
                    {item.price === null ? t.common.agreed : formatMoney(item.price, lang)}
                  </span>
                </li>
              ))}
            </ul>
            {data.discount && (
              <div className="summary__row">
                <span className="secondary">
                  {data.discount.reason ?? t.orders.discount}
                  {data.discount.percent !== null && `, ${data.discount.percent}%`}
                </span>
                <span className="num">−{formatMoney(data.discount.amount, lang)}</span>
              </div>
            )}
            <div className="summary__row">
              <span>{t.orders.total}</span>
              <span className="num-xl">{formatMoney(data.total, lang)}</span>
            </div>
            {data.unpricedCount > 0 && (
              <p className="secondary">{t.orders.unpriced(data.unpricedCount)}</p>
            )}
            {data.comment && (
              <p className="secondary">
                {t.orders.comment}: {data.comment}
              </p>
            )}
          </div>

          <ActSection order={data} />
          {data.status === 'completed' && <ResultSection order={data} onBook={onBook} />}

          <div className="card">
            <h2 className="title">{t.orders.progress}</h2>
            <ol className="tracker">
              {data.history.map((step) => (
                <li key={`${step.status}-${step.at.at}`} className="tracker__step">
                  <span className="tracker__dot" aria-hidden="true" />
                  <span>{t.status[step.status]}</span>
                  <span className="secondary">
                    {formatDateLong(step.at.date, lang)}, {step.at.time}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {data.canRequestReschedule && (
            <Button
              variant="secondary"
              busy={reschedule.isPending}
              onClick={() => reschedule.mutate()}
            >
              {t.orders.reschedule}
            </Button>
          )}
          {data.canCancel && !cancelling && (
            <Button variant="link" onClick={() => setCancelling(true)}>
              {t.orders.cancel}
            </Button>
          )}

          {cancelling && (
            <div className="card form-stack">
              <h2 className="title">{t.orders.cancelTitle}</h2>
              <div className="chips">
                {reasons.map((reason) => (
                  <button
                    key={reason.id}
                    type="button"
                    className={reason.id === reasonId ? 'chip-choice is-selected' : 'chip-choice'}
                    onClick={() => setReasonId(reason.id)}
                  >
                    {pick(lang, { uz: reason.nameUz, ru: reason.nameRu })}
                  </button>
                ))}
              </div>
              {chosenReason?.requiresText && (
                <label className="field">
                  <span className="field__label">{t.orders.cancelNote}</span>
                  <input
                    className="field__input"
                    maxLength={300}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
              )}
              <Button
                busy={cancel.isPending}
                disabled={!chosenReason || (chosenReason.requiresText && note.trim() === '')}
                onClick={() => cancel.mutate()}
              >
                {t.orders.cancelConfirm}
              </Button>
              <Button variant="secondary" onClick={() => setCancelling(false)}>
                {t.orders.keep}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
