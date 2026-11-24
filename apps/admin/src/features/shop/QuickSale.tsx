import type { AdminShopOrder } from '@cs/shared';
import { formatMoney, formatQtyNumber } from '@cs/shared/format';
import { LIMITS, PAYMENT_METHODS, type PaymentMethod } from '@cs/shared/vocabulary';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { call } from '../../api';
import { useLang, useT } from '../../i18n';
import { apiMessage } from '../../lib/errors';
import { TODAY_KEY } from '../../lib/keys';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Notice } from '../../ui/Notice';

/**
 * Tezkor sotuv: a client at the counter buys from the free stock and pays at once — no call, no
 * gathering. The server prices the lines, takes the goods off and writes the payment and receipt.
 */
export function QuickSaleDialog({
  onClose,
  onSold,
}: {
  onClose: () => void;
  onSold: (order: AdminShopOrder) => void;
}) {
  const t = useT();
  const lang = useLang();
  const queryClient = useQueryClient();
  const [find, setFind] = useState('');
  const [lines, setLines] = useState<{ productId: string; qty: number }[]>([]);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [receiptNo, setReceiptNo] = useState('');
  const requestId = useRef(crypto.randomUUID());

  const products = useQuery({
    queryKey: ['shop', 'sale-products'],
    queryFn: () => call('admin.saleProducts'),
  });
  const items = products.data?.items ?? [];
  const byId = new Map(items.map((item) => [item.id, item]));
  const name = (item: { nameUz: string; nameRu: string; pack: string | null }) =>
    lang === 'ru' ? item.nameRu : item.nameUz;
  const term = find.trim().toLowerCase();
  const found = term
    ? items
        .filter(
          (item) =>
            item.free > 0 &&
            (name(item).toLowerCase().includes(term) || item.sku.toLowerCase().includes(term)),
        )
        .slice(0, 8)
    : [];

  const setQty = (productId: string, qty: number) =>
    setLines((current) => {
      const max = Math.min(Math.floor(byId.get(productId)?.free ?? 0), LIMITS.cartQty.max);
      const capped = Math.max(0, Math.min(qty, max));
      const rest = current.filter((line) => line.productId !== productId);
      if (capped === 0) return rest;
      return current.some((line) => line.productId === productId)
        ? current.map((line) => (line.productId === productId ? { productId, qty: capped } : line))
        : [...current, { productId, qty: capped }];
    });

  // What to take; the server prices it again and refuses if the payment does not match.
  const total = lines.reduce(
    (sum, line) => sum + (byId.get(line.productId)?.price ?? 0) * line.qty,
    0,
  );

  const sell = useMutation({
    mutationFn: () =>
      call('admin.quickSale', {
        body: {
          requestId: requestId.current,
          clientId: null,
          items: lines,
          payments: total > 0 ? [{ method, amount: total }] : [],
          receiptNo: receiptNo.trim(),
        },
      }),
    onSuccess: async (order) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['shop'] }),
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
        queryClient.invalidateQueries({ queryKey: TODAY_KEY }),
      ]);
      onSold(order);
    },
    // The same key on a retry: a refused sale wrote nothing, and a sale whose answer was lost
    // comes back as it is instead of being made twice.
    onError: () => queryClient.invalidateQueries({ queryKey: ['shop', 'sale-products'] }),
  });

  return (
    <Dialog title={t.shop.quick.title} onClose={onClose} wide>
      <div className="form-stack quick-sale">
        {products.isError && <Notice tone="danger">{apiMessage(products.error, t)}</Notice>}
        {products.isSuccess && items.length === 0 && <p className="muted">{t.shop.quick.empty}</p>}
        <label className="field">
          <span className="field__label">{t.shop.quick.find}</span>
          <input
            className="field__input"
            type="search"
            value={find}
            onChange={(event) => setFind(event.target.value)}
          />
        </label>
        {found.length > 0 && (
          <ul className="picklist">
            {found.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="picklist__row"
                  onClick={() => {
                    setQty(
                      item.id,
                      (lines.find((line) => line.productId === item.id)?.qty ?? 0) + 1,
                    );
                    setFind('');
                  }}
                >
                  <span>{name(item)}</span>
                  <span className="muted num">
                    {t.shop.quick.free(formatQtyNumber(item.free))} ·{' '}
                    {formatMoney(item.price, lang)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <h3 className="field__label">{t.shop.quick.lines}</h3>
        {lines.length === 0 && <p className="muted">{t.shop.quick.noLines}</p>}
        <ul className="quick-sale__lines">
          {lines.map((line) => {
            const item = byId.get(line.productId);
            if (!item) return null;
            return (
              <li key={line.productId}>
                <span>{name(item)}</span>
                <span className="quick-sale__qty">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    aria-label="−"
                    onClick={() => setQty(line.productId, line.qty - 1)}
                  >
                    <Minus size={16} aria-hidden="true" />
                  </button>
                  <span className="num">{line.qty}</span>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    aria-label="+"
                    disabled={line.qty >= Math.min(Math.floor(item.free), LIMITS.cartQty.max)}
                    onClick={() => setQty(line.productId, line.qty + 1)}
                  >
                    <Plus size={16} aria-hidden="true" />
                  </button>
                </span>
                <span className="num">{formatMoney(item.price * line.qty, lang)}</span>
                <button
                  type="button"
                  className="btn btn--ghost"
                  aria-label={t.shop.quick.remove}
                  onClick={() => setQty(line.productId, 0)}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="quick-sale__total">
          <span>{t.shop.quick.total}</span>
          <strong className="num">{formatMoney(total, lang)}</strong>
        </div>

        <div className="pills" role="radiogroup" aria-label={t.shop.quick.method}>
          {PAYMENT_METHODS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={method === value}
              className={method === value ? 'pill is-active' : 'pill'}
              onClick={() => setMethod(value)}
            >
              {t.paymentMethod[value]}
            </button>
          ))}
        </div>
        <label className="field">
          <span className="field__label">{t.handover.receiptNo}</span>
          <input
            className="field__input"
            maxLength={64}
            value={receiptNo}
            onChange={(event) => setReceiptNo(event.target.value)}
          />
        </label>
        {sell.isError && <Notice tone="danger">{apiMessage(sell.error, t)}</Notice>}
        <div className="dialog__actions">
          <Button variant="secondary" onClick={onClose}>
            {t.common.close}
          </Button>
          <Button
            disabled={lines.length === 0 || receiptNo.trim() === ''}
            busy={sell.isPending}
            onClick={() => sell.mutate()}
          >
            {t.shop.quick.sell}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
