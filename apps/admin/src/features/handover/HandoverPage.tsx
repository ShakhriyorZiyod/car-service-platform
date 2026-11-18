import type { Handover } from '@cs/shared';
import { formatAmount, formatMoney } from '@cs/shared/format';
import { PAYMENT_METHODS, type PaymentMethod } from '@cs/shared/vocabulary';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Receipt } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { call } from '../../api';
import { useLang, useT } from '../../i18n';
import { apiMessage } from '../../lib/errors';
import { ORDERS_KEY, POLL_MS, TODAY_KEY, handoverKey, orderKey } from '../../lib/keys';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { PhotoStrip } from '../../ui/PhotoViewer';
import { PlateChip } from '../../ui/PlateChip';
import { StatusChip } from '../../ui/StatusChip';
import './handover.css';

/**
 * Topshirish (design A8): the work done and by whom, the photos to show the client, the discount,
 * the payment by one method or mixed, the fiscal receipt's number, and checkout in one step. After
 * it, the payments as they were taken; the owner may correct a method chosen by mistake.
 */
export function HandoverPage() {
  const t = useT();
  const { id = '' } = useParams();
  const handover = useQuery({
    queryKey: handoverKey(id),
    queryFn: () => call('admin.handover', { params: { id } }),
    refetchInterval: POLL_MS,
  });
  return (
    <section className="handover">
      <Link className="back-link" to={`/orders/${id}`}>
        <ArrowLeft size={16} aria-hidden="true" />
        {t.handover.back}
      </Link>
      {handover.isError && <Notice tone="danger">{apiMessage(handover.error, t)}</Notice>}
      {handover.data && <HandoverView data={handover.data} />}
    </section>
  );
}

function useRefresh(orderId: string) {
  const queryClient = useQueryClient();
  return async (updated?: Handover) => {
    if (updated) queryClient.setQueryData(handoverKey(orderId), updated);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: handoverKey(orderId) }),
      queryClient.invalidateQueries({ queryKey: orderKey(orderId) }),
      queryClient.invalidateQueries({ queryKey: ORDERS_KEY }),
      queryClient.invalidateQueries({ queryKey: TODAY_KEY }),
    ]);
  };
}

function HandoverView({ data }: { data: Handover }) {
  const t = useT();
  const { order } = data;
  return (
    <>
      <header className="handover__head">
        <div className="handover__title">
          <h1 className="page-title">{t.handover.title(order.number)}</h1>
          <span className="handover__car">{order.car.label}</span>
          <PlateChip plate={order.car.plate} />
          <StatusChip status={order.status} />
        </div>
        <span className="muted">
          {data.waitingMin === null
            ? t.handover.client(order.client.fullName)
            : t.handover.waiting(order.client.fullName, data.waitingMin)}
        </span>
      </header>
      <div className="handover__grid">
        <WorkCard data={data} />
        {order.status === 'completed' ? (
          <PaidCard data={data} />
        ) : order.actions.canCheckout ? (
          <PaymentCard data={data} />
        ) : (
          <section className="card handover__card">
            <Notice tone="info">{t.handover.notReady}</Notice>
          </section>
        )}
      </div>
    </>
  );
}

/** The act of the work done: zones, masters, prices, the discount, what to pay, the photos. */
function WorkCard({ data }: { data: Handover }) {
  const t = useT();
  const lang = useLang();
  const { order } = data;
  const counted = order.items.filter(
    (item) => item.approval === 'not_required' || item.approval === 'approved',
  );
  const masterOf = (itemId: string) =>
    data.masters.find((entry) => entry.itemId === itemId)?.masterName ?? t.common.none;
  const nameOf = (item: { nameUz: string; nameRu: string }) =>
    lang === 'ru' ? item.nameRu : item.nameUz;
  const photos = data.photos.flatMap((task) => [
    ...task.before.map((photo) => ({
      ...photo,
      caption: `${task.items.map(nameOf).join(', ')}: ${t.handover.before}`,
    })),
    ...task.after.map((photo) => ({
      ...photo,
      caption: `${task.items.map(nameOf).join(', ')}: ${t.handover.after}`,
    })),
  ]);

  return (
    <section className="card handover__card">
      <header className="handover__card-head">
        <h2 className="section-title">{t.handover.actTitle}</h2>
        <span className="muted num">№{order.number}</span>
      </header>
      <table className="table">
        <thead>
          <tr>
            <th>{t.handover.columns.work}</th>
            <th>{t.handover.columns.master}</th>
            <th className="table__num">{t.handover.columns.price}</th>
          </tr>
        </thead>
        <tbody>
          {counted.map((item) => (
            <tr key={item.id}>
              <td>
                {lang === 'ru' ? item.typeNameRu : item.typeNameUz}: {nameOf(item)}
              </td>
              <td className="muted">{masterOf(item.id)}</td>
              <td className="table__num num">
                {item.price === null ? (
                  order.actions.canPriceItems ? (
                    <PriceInput orderId={order.id} itemId={item.id} />
                  ) : (
                    t.handover.toAgree
                  )
                ) : (
                  formatAmount(item.price)
                )}
              </td>
            </tr>
          ))}
          {order.discount && (
            <tr>
              <td className="muted" colSpan={2}>
                {t.handover.discountLine(order.discount.reason, order.discount.percent)}
              </td>
              <td className="table__num num handover__minus">
                −{formatAmount(order.discount.amount)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {order.unpricedCount > 0 && <Notice tone="warning">{t.handover.unpricedNote}</Notice>}
      <div className="handover__total">
        <span className="section-title">{t.handover.toPay}</span>
        <span className="handover__total-value num">{formatMoney(order.total, lang)}</span>
      </div>
      <h3 className="section-title">{t.handover.photosTitle}</h3>
      <PhotoStrip photos={photos} empty={t.handover.noPhotos} />
    </section>
  );
}

/** A price for a zone "to be agreed": fixed once saved (PLAN 22). */
function PriceInput({ orderId, itemId }: { orderId: string; itemId: string }) {
  const t = useT();
  const refresh = useRefresh(orderId);
  const [value, setValue] = useState('');
  const save = useMutation({
    mutationFn: (price: number) =>
      call('admin.priceItem', { params: { id: orderId, itemId }, body: { price } }),
    onSuccess: () => refresh(),
  });
  const price = Number(value.replace(/\s/g, ''));
  const valid = value.trim() !== '' && Number.isSafeInteger(price) && price >= 0;
  return (
    <span className="handover__price">
      <input
        className="field__input num"
        inputMode="numeric"
        aria-label={t.handover.price}
        placeholder={t.handover.toAgree}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button
        variant="secondary"
        disabled={!valid}
        busy={save.isPending}
        onClick={() => save.mutate(price)}
      >
        {t.handover.savePrice}
      </Button>
      {save.isError && <span className="field__error">{apiMessage(save.error, t)}</span>}
    </span>
  );
}

type Choice = PaymentMethod | 'mixed';

/** Whole so‘m typed by a person, spaces allowed; null when it is not a number. */
const amountOf = (text: string): number | null => {
  const cleaned = text.replace(/\s/g, '');
  if (cleaned === '') return 0;
  const value = Number(cleaned);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
};

/** How the client pays, the discount and the receipt (design A8, right column). */
function PaymentCard({ data }: { data: Handover }) {
  const t = useT();
  const lang = useLang();
  const { order } = data;
  const refresh = useRefresh(order.id);
  const [choice, setChoice] = useState<Choice>('cash');
  const [mixed, setMixed] = useState<Record<PaymentMethod, string>>({
    cash: '',
    card_terminal: '',
    transfer: '',
  });
  const [receiptNo, setReceiptNo] = useState('');
  // One key for this handover: a retry after a lost answer gives the same result (PLAN 11).
  const requestId = useRef(crypto.randomUUID());

  const lines: { method: PaymentMethod; amount: number }[] =
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
  const paid = lines.reduce((sum, line) => sum + line.amount, 0);
  const rest = order.total - paid;
  const blocked =
    order.unpricedCount > 0
      ? t.handover.blocked.unpriced
      : typedWrong || rest !== 0
        ? t.handover.blocked.mismatch
        : receiptNo.trim() === ''
          ? t.handover.blocked.receipt
          : null;

  const checkout = useMutation({
    mutationFn: () =>
      call('admin.checkout', {
        params: { id: order.id },
        body: { requestId: requestId.current, payments: lines, receiptNo: receiptNo.trim() },
      }),
    onSuccess: (updated) => refresh(updated),
    onError: () => refresh(),
  });

  return (
    <section className="card handover__card">
      <h2 className="section-title">{t.handover.paymentTitle}</h2>
      <div className="handover__methods" role="radiogroup" aria-label={t.handover.paymentTitle}>
        {[...PAYMENT_METHODS, 'mixed' as const].map((method) => (
          <button
            key={method}
            type="button"
            role="radio"
            aria-checked={choice === method}
            className={choice === method ? 'handover__method is-active' : 'handover__method'}
            onClick={() => setChoice(method)}
          >
            {method === 'mixed' ? t.handover.mixed : t.paymentMethod[method]}
          </button>
        ))}
      </div>

      {choice === 'mixed' && (
        <div className="handover__split">
          {PAYMENT_METHODS.map((method) => (
            <label key={method} className="handover__split-row">
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
          <div className={rest === 0 ? 'handover__rest is-even' : 'handover__rest'}>
            <span>{t.handover.rest}</span>
            <span className="num">{formatMoney(rest, lang)}</span>
          </div>
        </div>
      )}

      {order.actions.canDiscount && <DiscountForm data={data} />}

      <label className="field">
        <span className="field__label">{t.handover.receiptNo}</span>
        <input
          className="field__input"
          maxLength={64}
          value={receiptNo}
          onChange={(event) => setReceiptNo(event.target.value)}
        />
      </label>
      <Notice tone="info">
        <span className="handover__receipt-hint">
          <Receipt size={16} aria-hidden="true" />
          {t.handover.receiptHint}
        </span>
      </Notice>

      {checkout.isError && <Notice tone="danger">{apiMessage(checkout.error, t)}</Notice>}
      <Button
        className="handover__submit"
        disabled={blocked !== null}
        busy={checkout.isPending}
        onClick={() => checkout.mutate()}
      >
        {t.handover.submit}
      </Button>
      {blocked && <p className="handover__blocked">{blocked}</p>}
    </section>
  );
}

/** The discount: a percentage or an amount, with a reason (PLAN 11). */
function DiscountForm({ data }: { data: Handover }) {
  const t = useT();
  const { order } = data;
  const refresh = useRefresh(order.id);
  const [kind, setKind] = useState<'percent' | 'amount'>(
    order.discount && order.discount.percent === null ? 'amount' : 'percent',
  );
  const [value, setValue] = useState(
    order.discount ? String(order.discount.percent ?? order.discount.amount) : '',
  );
  const [reason, setReason] = useState(order.discount?.reason ?? '');

  const number = Number(value.replace(/\s/g, '').replace(',', '.'));
  const valid =
    value.trim() !== '' &&
    Number.isFinite(number) &&
    number > 0 &&
    (kind === 'percent' ? number <= 100 : Number.isSafeInteger(number)) &&
    reason.trim() !== '';

  const apply = useMutation({
    mutationFn: () =>
      call('admin.setDiscount', {
        params: { id: order.id },
        body:
          kind === 'percent'
            ? { kind, percent: number, reason: reason.trim() }
            : { kind, amount: number, reason: reason.trim() },
      }),
    onSuccess: () => refresh(),
  });
  const remove = useMutation({
    mutationFn: () =>
      call('admin.setDiscount', { params: { id: order.id }, body: { kind: 'none' } }),
    onSuccess: () => {
      setValue('');
      setReason('');
      return refresh();
    },
  });

  return (
    <fieldset className="handover__discount">
      <legend className="field__label">{t.handover.discountTitle}</legend>
      <div className="handover__discount-row">
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
      <span className="field__hint">
        {data.discountUnlimited
          ? t.handover.discountUnlimited
          : t.handover.discountLimit(data.discountLimitPct)}
      </span>
      {(apply.isError || remove.isError) && (
        <Notice tone="danger">{apiMessage(apply.error ?? remove.error, t)}</Notice>
      )}
      <div className="handover__discount-actions">
        <Button
          variant="secondary"
          disabled={!valid}
          busy={apply.isPending}
          onClick={() => apply.mutate()}
        >
          {t.handover.discountApply}
        </Button>
        {order.discount && (
          <Button variant="ghost" busy={remove.isPending} onClick={() => remove.mutate()}>
            {t.handover.discountRemove}
          </Button>
        )}
      </div>
    </fieldset>
  );
}

/** After checkout: what was taken, by which method, and the receipt (PLAN 11). */
function PaidCard({ data }: { data: Handover }) {
  const t = useT();
  const lang = useLang();
  const refresh = useRefresh(data.order.id);
  const correct = useMutation({
    mutationFn: (input: { id: string; method: PaymentMethod }) =>
      call('admin.correctPayment', { params: { id: input.id }, body: { method: input.method } }),
    onSuccess: (updated) => refresh(updated),
  });
  return (
    <section className="card handover__card">
      <h2 className="section-title">{t.handover.paidTitle}</h2>
      <table className="table">
        <tbody>
          {data.payments.map((payment) => (
            <tr key={payment.id}>
              <td>
                {data.canCorrectPayments ? (
                  <select
                    className="field__input"
                    aria-label={t.handover.correct}
                    value={payment.method}
                    disabled={correct.isPending}
                    onChange={(event) =>
                      correct.mutate({
                        id: payment.id,
                        method: event.target.value as PaymentMethod,
                      })
                    }
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {t.paymentMethod[method]}
                      </option>
                    ))}
                  </select>
                ) : (
                  t.paymentMethod[payment.method]
                )}
              </td>
              <td className="table__num num">{formatMoney(payment.amount, lang)}</td>
            </tr>
          ))}
          <tr className="table__total">
            <td>{t.handover.toPay}</td>
            <td className="table__num num">{formatMoney(data.order.total, lang)}</td>
          </tr>
        </tbody>
      </table>
      {data.canCorrectPayments && <p className="field__hint">{t.handover.correctHint}</p>}
      {correct.isError && <Notice tone="danger">{apiMessage(correct.error, t)}</Notice>}
      {data.receipt && (
        <p className="handover__receipt">
          <Receipt size={16} aria-hidden="true" />
          {t.handover.receipt(data.receipt.receiptNo)}
          <span className="muted">
            {' · '}
            {t.handover.paidAt(
              `${data.receipt.createdAt.date.slice(8)}.${data.receipt.createdAt.date.slice(5, 7)} ${data.receipt.createdAt.time}`,
            )}
          </span>
        </p>
      )}
    </section>
  );
}
