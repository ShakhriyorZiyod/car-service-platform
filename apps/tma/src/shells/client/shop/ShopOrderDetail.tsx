import type { ShopOrder } from '@cs/shared';
import { formatDateLong, formatMoney } from '@cs/shared/format';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useApi, useBootstrap } from '../../../bootstrap';
import { useLang, useT } from '../../../i18n';
import { errorText, pick, shopOrderKey, useCatalog, useShopOrder } from '../../../lib/client-data';
import { Button } from '../../../ui/Button';
import { ScreenHeader, ShopStatusChip, Skeleton } from '../../../ui/client-parts';
import { Notice } from '../../../ui/Notice';
import './shop.css';

/**
 * A shop order as its client follows it: what is in it, what happens next, and cancelling while
 * the server allows it. Telegram's back button is the client shell's.
 */
export default function ShopOrderDetail({
  shopOrderId,
  onBack,
}: {
  shopOrderId: string;
  onBack: () => void;
}) {
  const t = useT().client;
  const lang = useLang();
  const api = useApi();
  const queryClient = useQueryClient();
  const workshop = useBootstrap().data?.workshop;
  const order = useShopOrder(shopOrderId);
  const catalog = useCatalog();
  const [cancelling, setCancelling] = useState(false);
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const cancel = useMutation({
    mutationFn: () =>
      api.call('client.cancelShopOrder', {
        params: { id: shopOrderId },
        body: { reasonId: reasonId ?? '', note: note.trim() || null },
      }),
    onSuccess: async (updated: ShopOrder) => {
      setCancelling(false);
      queryClient.setQueryData(shopOrderKey(shopOrderId), updated);
      await queryClient.invalidateQueries({ queryKey: ['shopOrders'] });
      await queryClient.invalidateQueries({ queryKey: ['shopProducts'] });
    },
  });

  const data = order.data;
  const reasons = catalog.data?.cancelReasons ?? [];
  const chosen = reasons.find((reason) => reason.id === reasonId);

  return (
    <section className="screen">
      <ScreenHeader
        title={data ? t.shop.detailTitle(data.number) : t.common.loading}
        onBack={onBack}
        aside={data && <ShopStatusChip status={data.status} />}
      />
      {order.isPending && <Skeleton />}
      {order.isError && <Notice tone="danger">{errorText(t, order.error)}</Notice>}
      {cancel.isError && <Notice tone="danger">{errorText(t, cancel.error)}</Notice>}
      {data && (
        <>
          {data.status === 'new' && <Notice>{t.shop.waitCall}</Notice>}
          {data.status === 'confirmed' && <Notice>{t.shop.gathering}</Notice>}
          {data.status === 'ready_for_pickup' && data.pickupUntil && (
            <Notice tone="warning">
              {t.shop.pickupUntil(
                `${formatDateLong(data.pickupUntil.date, lang)}, ${data.pickupUntil.time}`,
              )}
            </Notice>
          )}
          {data.cancelReason && <Notice tone="danger">{pick(lang, data.cancelReason)}</Notice>}

          <div className="card">
            <h2 className="title">{t.shop.items}</h2>
            <ul className="summary__items">
              {data.items.map((item) => (
                <li key={item.productId}>
                  <span>
                    {pick(lang, { uz: item.nameUz, ru: item.nameRu })} × {item.qty}
                  </span>
                  <span className="num">{formatMoney(item.lineTotal, lang)}</span>
                </li>
              ))}
            </ul>
            {data.discount > 0 && (
              <div className="summary__row">
                <span className="secondary">{t.orders.discount}</span>
                <span className="num">−{formatMoney(data.discount, lang)}</span>
              </div>
            )}
            <div className="summary__row">
              <span className="title">{t.orders.total}</span>
              <span className="num title">{formatMoney(data.total, lang)}</span>
            </div>
            {data.receiptNo && (
              <span className="secondary">
                {t.orders.result.paid(
                  data.payments.map((line) => t.orders.result.methods[line.method]).join(', '),
                )}
                . {t.orders.result.receipt(data.receiptNo)}
              </span>
            )}
          </div>

          {workshop?.address && data.status !== 'completed' && data.status !== 'cancelled' && (
            <div className="card">
              <span className="secondary">{t.shop.where}</span>
              <span>{workshop.address}</span>
            </div>
          )}
          {data.comment && (
            <div className="card">
              <span className="secondary">{t.orders.comment}</span>
              <span>{data.comment}</span>
            </div>
          )}

          <div className="card">
            <h2 className="title">{t.orders.progress}</h2>
            <ol className="tracker">
              {data.history.map((step) => (
                <li key={`${step.status}-${step.at.at}`} className="tracker__step">
                  <span className="tracker__dot" aria-hidden="true" />
                  <span>{t.shop.status[step.status]}</span>
                  <span className="secondary">
                    {formatDateLong(step.at.date, lang)}, {step.at.time}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {data.canCancel && !cancelling && (
            <Button variant="link" onClick={() => setCancelling(true)}>
              {t.shop.cancel}
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
              {chosen?.requiresText && (
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
                disabled={!chosen || (chosen.requiresText && note.trim() === '')}
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
