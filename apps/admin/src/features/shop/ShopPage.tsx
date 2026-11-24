import type { AdminShopOrder, Instant } from '@cs/shared';
import { formatDateLong, formatMoney, formatPhone } from '@cs/shared/format';
import type { Lang } from '@cs/shared/i18n';
import {
  PAYMENT_METHODS,
  SHOP_ORDER_TABS,
  type PaymentMethod,
  type ShopOrderTab,
} from '@cs/shared/vocabulary';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Search } from 'lucide-react';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { call } from '../../api';
import { useCan } from '../../auth/session';
import { useLang, useT } from '../../i18n';
import { apiMessage } from '../../lib/errors';
import { POLL_MS, TODAY_KEY } from '../../lib/keys';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { ReasonDialog } from '../../ui/ReasonDialog';
import { QuickSaleDialog } from './QuickSale';
import './shop.css';

const SHOP_KEY = ['shop'] as const;
const listKey = (tab: ShopOrderTab, q: string) => ['shop', 'list', tab, q] as const;
const orderKey = (id: string) => ['shop', 'order', id] as const;

export const when = (instant: Instant, lang: Lang): string =>
  `${formatDateLong(instant.date, lang)}, ${instant.time}`;

/**
 * Do'kon buyurtmalari (design A9): the queue by status on the left, the order on the right — the
 * call, the pick list and "Yig'ildi", the payment and the handover; and the quick sale at the
 * counter. Every action is the server's to allow; the buttons only show what it allows.
 */
export function ShopPage() {
  const t = useT();
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const tab = (SHOP_ORDER_TABS as readonly string[]).includes(params.get('tab') ?? '')
    ? (params.get('tab') as ShopOrderTab)
    : 'new';
  const selected = params.get('order');
  const [typed, setTyped] = useState('');
  const [selling, setSelling] = useState(false);
  const q = typed.trim();

  const list = useQuery({
    queryKey: listKey(tab, q),
    queryFn: () => call('admin.shopOrders', { query: { tab, ...(q && { q }) } }),
    refetchInterval: POLL_MS,
  });

  const setParam = (next: Record<string, string | null>) =>
    setParams((current) => {
      const copy = new URLSearchParams(current);
      for (const [key, value] of Object.entries(next)) {
        if (value === null) copy.delete(key);
        else copy.set(key, value);
      }
      return copy;
    });

  return (
    <section className="shop">
      <header className="shop__head">
        <h1 className="page-title">{t.shop.title}</h1>
        {can('shop.write') && can('checkout.write') && (
          <Button onClick={() => setSelling(true)}>{t.shop.quickSale}</Button>
        )}
      </header>

      <div className="shop__layout">
        <div className="shop__queue">
          <div className="pills" role="tablist">
            {SHOP_ORDER_TABS.map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                className={tab === value ? 'pill is-active' : 'pill'}
                onClick={() => setParam({ tab: value })}
              >
                {t.shop.tabs[value]}
              </button>
            ))}
          </div>
          <label className="shop__search">
            <Search size={16} aria-hidden="true" />
            <input
              className="field__input"
              type="search"
              placeholder={t.shop.search}
              aria-label={t.shop.search}
              maxLength={60}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          </label>
          {list.isError && <Notice tone="danger">{apiMessage(list.error, t)}</Notice>}
          {list.isSuccess && list.data.items.length === 0 && (
            <p className="muted">{t.shop.empty}</p>
          )}
          <ul className="shop__list">
            {list.data?.items.map((order) => (
              <li key={order.id}>
                <QueueCard
                  order={order}
                  active={order.id === selected}
                  onOpen={() => setParam({ order: order.id })}
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="shop__detail">
          {selected ? (
            <OrderPanel key={selected} id={selected} />
          ) : (
            <div className="card">
              <p className="muted">{t.shop.pick}</p>
            </div>
          )}
        </div>
      </div>

      {selling && (
        <QuickSaleDialog
          onClose={() => setSelling(false)}
          onSold={(order) => {
            setSelling(false);
            setParam({ tab: 'done', order: order.id });
          }}
        />
      )}
    </section>
  );
}

function ShopStatus({ status }: { status: AdminShopOrder['status'] }) {
  const t = useT();
  return (
    <span className={`status status--${status}`}>
      <span className="status__dot" aria-hidden="true" />
      {t.shop.status[status]}
    </span>
  );
}

function shortName(order: AdminShopOrder, t: ReturnType<typeof useT>): string {
  if (!order.client) return order.source === 'counter' ? t.shop.counter : t.shop.noClient;
  const [first, last] = order.client.fullName.split(' ');
  return last ? `${first} ${last.charAt(0)}.` : (first ?? '');
}

function QueueCard({
  order,
  active,
  onOpen,
}: {
  order: AdminShopOrder;
  active: boolean;
  onOpen: () => void;
}) {
  const t = useT();
  const lang = useLang();
  return (
    <button
      type="button"
      className={active ? 'card shop-card is-active' : 'card shop-card'}
      aria-current={active ? 'true' : undefined}
      onClick={onOpen}
    >
      <span className="shop-card__top">
        <span>
          <strong className="num">{t.shop.number(order.number)}</strong>{' '}
          <span className="muted">{shortName(order, t)}</span>
        </span>
        <ShopStatus status={order.status} />
      </span>
      <span className="shop-card__items">
        {order.items
          .map((item) => `${lang === 'ru' ? item.nameRu : item.nameUz} × ${item.qty}`)
          .join(', ')}
      </span>
      <span className="shop-card__bottom">
        <span className="muted">{t.shop.created(when(order.createdAt, lang))}</span>
        <strong className="num">{formatMoney(order.total, lang)}</strong>
      </span>
    </button>
  );
}

/** Refreshes the order and everything that counts it. */
function useRefresh(id: string) {
  const queryClient = useQueryClient();
  return async (updated?: AdminShopOrder) => {
    if (updated) queryClient.setQueryData(orderKey(id), updated);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: SHOP_KEY }),
      queryClient.invalidateQueries({ queryKey: TODAY_KEY }),
    ]);
  };
}

function OrderPanel({ id }: { id: string }) {
  const t = useT();
  const lang = useLang();
  const refresh = useRefresh(id);
  const [cancelling, setCancelling] = useState(false);
  const order = useQuery({
    queryKey: orderKey(id),
    queryFn: () => call('admin.shopOrder', { params: { id } }),
    refetchInterval: POLL_MS,
  });
  const cancel = useMutation({
    mutationFn: (input: { reasonId: string; note: string | null }) =>
      call('admin.cancelShopOrder', { params: { id }, body: input }),
    onSuccess: async (updated) => {
      setCancelling(false);
      await refresh(updated);
    },
  });

  if (order.isPending) return <div className="card muted">{t.form.loading}</div>;
  if (order.isError) return <Notice tone="danger">{apiMessage(order.error, t)}</Notice>;
  const data = order.data;

  return (
    <article className="card shop-panel">
      <header className="shop-panel__head">
        <div>
          <h2 className="section-title">{t.shop.orderTitle(data.number)}</h2>
          <p className="muted">
            {data.client
              ? `${data.client.fullName}${data.client.phone ? `, ${formatPhone(data.client.phone)}` : ''}`
              : shortName(data, t)}
          </p>
        </div>
        <ShopStatus status={data.status} />
      </header>

      {data.holdUntil && (
        <Notice tone="info">{t.shop.holdUntil(when(data.holdUntil, lang))}</Notice>
      )}
      {data.pickupUntil && (
        <Notice tone="warning">{t.shop.pickupUntil(when(data.pickupUntil, lang))}</Notice>
      )}
      {data.cancelReason && (
        <Notice tone="danger">
          {t.order.cancelledBecause(lang === 'ru' ? data.cancelReason.ru : data.cancelReason.uz)}
        </Notice>
      )}
      {data.client && !data.client.hasTelegram && data.status !== 'completed' && (
        <Notice tone="warning">{t.order.noTelegram}</Notice>
      )}

      {data.actions.canCall && <ShopCall order={data} />}
      {data.status === 'confirmed' ? <PickList order={data} /> : <Items order={data} />}
      {data.comment && (
        <dl className="facts">
          <div>
            <dt>{t.shop.comment}</dt>
            <dd>{data.comment}</dd>
          </div>
        </dl>
      )}
      {data.actions.canCheckout && <ShopCheckout order={data} />}
      {data.status === 'completed' && data.receipt && (
        <p className="muted">
          {t.shop.paid}:{' '}
          {data.paymentLines
            .map((line) => `${t.paymentMethod[line.method]} ${formatMoney(line.amount, lang)}`)
            .join(', ')}
          . {t.shop.receipt(data.receipt.receiptNo)}
        </p>
      )}

      {data.calls.length > 0 && (
        <section>
          <h3 className="field__label">{t.shop.calls}</h3>
          <ul className="timeline">
            {data.calls.map((entry) => (
              <li key={entry.id}>
                <span className="timeline__what">{t.order.callOutcome[entry.outcome]}</span>
                <span className="muted">
                  {when(entry.at, lang)}, {entry.adminName}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3 className="field__label">{t.shop.history}</h3>
        <ul className="timeline">
          {data.history.map((step) => (
            <li key={`${step.status}-${step.at.at}`}>
              <span className="timeline__what">{t.shop.status[step.status]}</span>
              <span className="muted">{when(step.at, lang)}</span>
            </li>
          ))}
        </ul>
      </section>

      {data.actions.canCancel && (
        <Button variant="ghost" onClick={() => setCancelling(true)}>
          {t.shop.cancel}
        </Button>
      )}
      {data.status !== 'completed' && data.status !== 'cancelled' && (
        <p className="muted shop-panel__note">{t.shop.autoCancel}</p>
      )}
      {cancelling && (
        <ReasonDialog
          title={t.shop.cancelTitle}
          submitLabel={t.shop.cancel}
          intro={<p className="muted">{t.shop.cancelIntro}</p>}
          pending={cancel.isPending}
          error={cancel.error}
          onSubmit={(value) => cancel.mutate(value)}
          onClose={() => setCancelling(false)}
        />
      )}
    </article>
  );
}

function Items({ order }: { order: AdminShopOrder }) {
  const t = useT();
  const lang = useLang();
  return (
    <section className="shop-items">
      <h3 className="field__label">{t.shop.items}</h3>
      <ul className="shop-items__list">
        {order.items.map((item) => (
          <li key={item.productId}>
            <span>{lang === 'ru' ? item.nameRu : item.nameUz}</span>
            <span className="num">× {item.qty}</span>
            <span className="num">{formatMoney(item.lineTotal, lang)}</span>
          </li>
        ))}
      </ul>
      <Totals order={order} />
    </section>
  );
}

function Totals({ order }: { order: AdminShopOrder }) {
  const t = useT();
  const lang = useLang();
  return (
    <div className="shop-totals">
      {order.discount > 0 && (
        <>
          <span className="muted">{t.shop.subtotal}</span>
          <span className="num">{formatMoney(order.subtotal, lang)}</span>
          <span className="muted">
            {t.shop.discount}
            {order.discountInfo?.reason ? `: ${order.discountInfo.reason}` : ''}
          </span>
          <span className="num">−{formatMoney(order.discount, lang)}</span>
        </>
      )}
      <span className="muted">
        {order.status === 'completed' || order.status === 'cancelled'
          ? t.shop.total
          : t.shop.pickupLine}
      </span>
      <strong className="num shop-totals__sum">{formatMoney(order.total, lang)}</strong>
    </div>
  );
}

/** "Yig'ish ro'yxati": tick every line as it goes into the bag, then "Yig'ildi". */
function PickList({ order }: { order: AdminShopOrder }) {
  const t = useT();
  const lang = useLang();
  const refresh = useRefresh(order.id);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const ready = useMutation({
    mutationFn: () => call('admin.shopOrderReady', { params: { id: order.id } }),
    onSuccess: (updated) => refresh(updated),
    onError: () => refresh(),
  });
  const all = picked.size === order.items.length;
  return (
    <section className="shop-items">
      <h3 className="field__label">{t.shop.pickList}</h3>
      <ul className="shop-pick">
        {order.items.map((item) => {
          const on = picked.has(item.productId);
          return (
            <li key={item.productId}>
              <label className={on ? 'shop-pick__row is-picked' : 'shop-pick__row'}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!order.actions.canReady}
                  onChange={() => {
                    const next = new Set(picked);
                    if (on) next.delete(item.productId);
                    else next.add(item.productId);
                    setPicked(next);
                  }}
                />
                <span className="shop-pick__name">{lang === 'ru' ? item.nameRu : item.nameUz}</span>
                <strong className="num">× {item.qty}</strong>
              </label>
            </li>
          );
        })}
      </ul>
      <Totals order={order} />
      {ready.isError && <Notice tone="danger">{apiMessage(ready.error, t)}</Notice>}
      {order.actions.canReady && (
        <Button
          disabled={!all}
          busy={ready.isPending}
          icon={all ? <Check size={18} aria-hidden="true" /> : undefined}
          onClick={() => ready.mutate()}
        >
          {all ? t.shop.gathered : t.shop.markAll(picked.size, order.items.length)}
        </Button>
      )}
    </section>
  );
}

/** The admin's three answers after calling the client. */
function ShopCall({ order }: { order: AdminShopOrder }) {
  const t = useT();
  const refresh = useRefresh(order.id);
  const [rejecting, setRejecting] = useState(false);
  const answer = useMutation({
    mutationFn: (input: {
      outcome: 'confirmed' | 'no_answer' | 'rejected';
      reasonId?: string;
      note?: string | null;
    }) =>
      call('admin.shopOrderCall', {
        params: { id: order.id },
        body: {
          outcome: input.outcome,
          ...(input.reasonId && { reasonId: input.reasonId }),
          ...(input.note && { note: input.note }),
        },
      }),
    onSuccess: async (updated) => {
      setRejecting(false);
      await refresh(updated);
    },
    onError: () => refresh(),
  });
  const busy = answer.isPending;
  return (
    <div className="call-actions">
      <div className="call-actions__buttons">
        <button
          type="button"
          className="call-btn call-btn--confirm"
          disabled={busy}
          onClick={() => answer.mutate({ outcome: 'confirmed' })}
        >
          {t.orders.call.confirmed}
        </button>
        <button
          type="button"
          className="call-btn"
          disabled={busy}
          onClick={() => answer.mutate({ outcome: 'no_answer' })}
        >
          {t.orders.call.no_answer}
        </button>
        <button
          type="button"
          className="call-btn call-btn--reject"
          disabled={busy}
          onClick={() => setRejecting(true)}
        >
          {t.orders.call.rejected}
        </button>
      </div>
      {answer.isError && !rejecting && (
        <p className="call-actions__error" role="alert">
          {apiMessage(answer.error, t)}
        </p>
      )}
      {rejecting && (
        <ReasonDialog
          title={t.shop.rejectTitle}
          submitLabel={t.orders.call.rejected}
          pending={busy}
          error={answer.error}
          onSubmit={(value) => answer.mutate({ outcome: 'rejected', ...value })}
          onClose={() => setRejecting(false)}
        />
      )}
    </div>
  );
}

const amountOf = (text: string): number | null => {
  const cleaned = text.replace(/\s/g, '');
  if (cleaned === '') return 0;
  const value = Number(cleaned);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
};

/** The discount, the payment by one method or mixed, the receipt and the handover (PLAN 11). */
function ShopCheckout({ order }: { order: AdminShopOrder }) {
  const t = useT();
  const lang = useLang();
  const refresh = useRefresh(order.id);
  const [choice, setChoice] = useState<PaymentMethod | 'mixed'>('cash');
  const [mixed, setMixed] = useState<Record<PaymentMethod, string>>({
    cash: '',
    card_terminal: '',
    transfer: '',
  });
  const [receiptNo, setReceiptNo] = useState('');
  // One key for this handover: a retry after a lost answer gives the same result.
  const requestId = useRef(crypto.randomUUID());

  const lines =
    choice === 'mixed'
      ? PAYMENT_METHODS.flatMap((method) => {
          const amount = amountOf(mixed[method]);
          return amount === null || amount === 0 ? [] : [{ method, amount }];
        })
      : order.total > 0
        ? [{ method: choice, amount: order.total }]
        : [];
  const typedWrong =
    choice === 'mixed' && PAYMENT_METHODS.some((method) => amountOf(mixed[method]) === null);
  const rest = order.total - lines.reduce((sum, line) => sum + line.amount, 0);
  const blocked =
    typedWrong || rest !== 0
      ? t.handover.blocked.mismatch
      : receiptNo.trim() === ''
        ? t.handover.blocked.receipt
        : null;

  const checkout = useMutation({
    mutationFn: () =>
      call('admin.shopCheckout', {
        params: { id: order.id },
        body: { requestId: requestId.current, payments: lines, receiptNo: receiptNo.trim() },
      }),
    onSuccess: (updated) => refresh(updated),
    onError: () => refresh(),
  });

  return (
    <section className="shop-pay">
      <h3 className="field__label">{t.handover.paymentTitle}</h3>
      <div className="pills" role="radiogroup" aria-label={t.handover.paymentTitle}>
        {[...PAYMENT_METHODS, 'mixed' as const].map((method) => (
          <button
            key={method}
            type="button"
            role="radio"
            aria-checked={choice === method}
            className={choice === method ? 'pill is-active' : 'pill'}
            onClick={() => setChoice(method)}
          >
            {method === 'mixed' ? t.handover.mixed : t.paymentMethod[method]}
          </button>
        ))}
      </div>
      {choice === 'mixed' && (
        <div className="shop-pay__split">
          {PAYMENT_METHODS.map((method) => (
            <label key={method} className="shop-pay__row">
              <span>{t.paymentMethod[method]}</span>
              <input
                className={
                  amountOf(mixed[method]) === null
                    ? 'field__input num is-invalid'
                    : 'field__input num'
                }
                inputMode="numeric"
                value={mixed[method]}
                onChange={(event) => setMixed({ ...mixed, [method]: event.target.value })}
              />
            </label>
          ))}
          <div className="shop-pay__row">
            <span>{t.handover.rest}</span>
            <strong className="num">{formatMoney(rest, lang)}</strong>
          </div>
        </div>
      )}
      {order.actions.canDiscount && <ShopDiscount order={order} />}
      <label className="field">
        <span className="field__label">{t.handover.receiptNo}</span>
        <input
          className="field__input"
          maxLength={64}
          value={receiptNo}
          onChange={(event) => setReceiptNo(event.target.value)}
        />
      </label>
      {checkout.isError && <Notice tone="danger">{apiMessage(checkout.error, t)}</Notice>}
      <Button
        disabled={blocked !== null}
        busy={checkout.isPending}
        onClick={() => checkout.mutate()}
      >
        {t.shop.checkout}
      </Button>
      {blocked && <p className="muted">{blocked}</p>}
    </section>
  );
}

function ShopDiscount({ order }: { order: AdminShopOrder }) {
  const t = useT();
  const refresh = useRefresh(order.id);
  const info = order.discountInfo;
  const [kind, setKind] = useState<'percent' | 'amount'>(
    info && info.percent === null ? 'amount' : 'percent',
  );
  const [value, setValue] = useState(info ? String(info.percent ?? info.amount) : '');
  const [reason, setReason] = useState(info?.reason ?? '');
  const compact = value.replace(/\s/g, '').replace(',', '.');
  const number = Number(compact);
  const wellFormed =
    (kind === 'percent' ? /^\d+(\.\d{1,2})?$/ : /^\d+$/).test(compact) &&
    number > 0 &&
    (kind === 'percent' ? number <= 100 : Number.isSafeInteger(number));
  const apply = useMutation({
    mutationFn: () =>
      call('admin.setShopDiscount', {
        params: { id: order.id },
        body:
          kind === 'percent'
            ? { kind, percent: number, reason: reason.trim() }
            : { kind, amount: number, reason: reason.trim() },
      }),
    onSuccess: (updated) => refresh(updated),
  });
  const remove = useMutation({
    mutationFn: () =>
      call('admin.setShopDiscount', { params: { id: order.id }, body: { kind: 'none' } }),
    onSuccess: (updated) => {
      setValue('');
      setReason('');
      return refresh(updated);
    },
  });
  return (
    <fieldset className="shop-discount">
      <legend className="field__label">{t.handover.discountTitle}</legend>
      <div className="shop-discount__row">
        <input
          className="field__input num"
          inputMode="decimal"
          aria-label={t.handover.discountValue}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <div className="pills" role="radiogroup" aria-label={t.handover.discountValue}>
          {(['percent', 'amount'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={kind === option}
              className={kind === option ? 'pill is-active' : 'pill'}
              onClick={() => setKind(option)}
            >
              {t.handover.discountKind[option]}
            </button>
          ))}
        </div>
        <input
          className="field__input"
          aria-label={t.handover.discountReason}
          placeholder={t.handover.discountReasonHint}
          maxLength={200}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      {compact !== '' && !wellFormed && (
        <span className="field__error">{t.handover.discountInvalid[kind]}</span>
      )}
      <span className="field__hint">
        {order.discountUnlimited
          ? t.handover.discountUnlimited
          : t.handover.discountLimit(order.discountLimitPct)}
      </span>
      {(apply.isError || remove.isError) && (
        <Notice tone="danger">{apiMessage(apply.error ?? remove.error, t)}</Notice>
      )}
      <div className="shop-discount__actions">
        <Button
          variant="secondary"
          disabled={!wellFormed || reason.trim() === ''}
          busy={apply.isPending}
          onClick={() => apply.mutate()}
        >
          {t.handover.discountApply}
        </Button>
        {info && (
          <Button variant="ghost" busy={remove.isPending} onClick={() => remove.mutate()}>
            {t.handover.discountRemove}
          </Button>
        )}
      </div>
    </fieldset>
  );
}
