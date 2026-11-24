import { formatMoney } from '@cs/shared/format';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Info, ShoppingCart, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { ApiRequestError } from '../../../api';
import { useApi, useBootstrap } from '../../../bootstrap';
import { useLang, useT } from '../../../i18n';
import { useCart } from '../../../lib/cart';
import { errorText, pick } from '../../../lib/client-data';
import { Button } from '../../../ui/Button';
import { BottomBar, EmptyState, ScreenHeader, Skeleton } from '../../../ui/client-parts';
import { Notice } from '../../../ui/Notice';
import { PhoneGate } from '../../../ui/PhoneGate';
import { ProductPhoto, Stepper, useQuote } from './parts';

/** T11: the cart — the lines priced by the server, how to get them and "order" (client PDF, p. 12). */
export function CartScreen({
  onBack,
  onSent,
}: {
  onBack: () => void;
  onSent: (shopOrderId: string, number: number) => void;
}) {
  const t = useT().client;
  const lang = useLang();
  const api = useApi();
  const queryClient = useQueryClient();
  const workshop = useBootstrap().data?.workshop;
  const cart = useCart();
  const quote = useQuote(cart.lines);
  const [comment, setComment] = useState('');
  // One key per attempt: a repeated tap or a retry after a lost answer makes one order.
  const requestId = useRef(crypto.randomUUID());

  const order = useMutation({
    mutationFn: () =>
      api.call('client.createShopOrder', {
        body: {
          requestId: requestId.current,
          items: [...cart.lines],
          comment: comment.trim() || null,
        },
      }),
    onSuccess: async (created) => {
      cart.clear();
      requestId.current = crypto.randomUUID();
      await queryClient.invalidateQueries({ queryKey: ['shopOrders'] });
      await queryClient.invalidateQueries({ queryKey: ['shopProducts'] });
      onSent(created.id, created.number);
    },
    onError: async (error) => {
      // The stock changed meanwhile: a fresh quote shows which lines.
      if (error instanceof ApiRequestError && error.code === 'out_of_stock') {
        requestId.current = crypto.randomUUID();
        await queryClient.invalidateQueries({ queryKey: ['shopQuote'] });
      }
    },
  });

  const lines = quote.data?.lines ?? [];

  if (cart.lines.length === 0) {
    return (
      <section className="screen">
        <ScreenHeader title={t.shop.cart.title} onBack={onBack} />
        <EmptyState
          icon={<ShoppingCart size={28} />}
          title={t.shop.cart.empty}
          text={t.shop.cart.emptyText}
          action={<Button onClick={onBack}>{t.shop.cart.toCatalog}</Button>}
        />
      </section>
    );
  }

  return (
    <PhoneGate>
      <section className="screen screen--with-bar">
        <ScreenHeader
          title={t.shop.cart.title}
          onBack={onBack}
          aside={<span className="secondary">{t.shop.cart.count(cart.lines.length)}</span>}
        />
        {quote.isPending && <Skeleton rows={3} />}
        {quote.isError && <Notice tone="danger">{errorText(t, quote.error)}</Notice>}
        {order.isError && <Notice tone="danger">{errorText(t, order.error)}</Notice>}
        {quote.data && !quote.data.canOrder && <Notice tone="warning">{t.shop.cart.fix}</Notice>}

        {lines.length > 0 && (
          <div className="card cart-lines">
            <ul className="list">
              {lines.map((line) => {
                const name = pick(lang, { uz: line.nameUz, ru: line.nameRu });
                const title = name;
                return (
                  <li key={line.productId} className="cart-line">
                    <ProductPhoto src={line.photo} alt={title} size="sm" />
                    <span className="cart-line__text">
                      <span className="cart-line__name">
                        {line.problem === 'gone' ? title || '—' : title}
                      </span>
                      {line.problem !== 'gone' && (
                        <span className="num">{formatMoney(line.price, lang)}</span>
                      )}
                      {line.problem === 'gone' && (
                        <span className="cart-line__problem">{t.shop.cart.gone}</span>
                      )}
                      {line.problem === 'short' && (
                        <span className="cart-line__problem">{t.shop.cart.short(line.maxQty)}</span>
                      )}
                    </span>
                    {line.problem === 'gone' || line.maxQty === 0 ? (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={t.shop.cart.remove}
                        onClick={() => cart.set(line.productId, 0)}
                      >
                        <Trash2 size={20} aria-hidden="true" />
                      </button>
                    ) : (
                      <Stepper
                        qty={line.qty}
                        max={line.maxQty}
                        tone="light"
                        onChange={(qty) => cart.set(line.productId, Math.min(qty, line.maxQty))}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
            <Button variant="link" onClick={onBack}>
              {t.shop.cart.addMore}
            </Button>
          </div>
        )}

        <h2 className="title">{t.shop.cart.how}</h2>
        <div className="card pickup-choice is-selected">
          <span className="pickup-choice__radio" aria-hidden="true" />
          <span className="form-stack pickup-choice__text">
            <strong>{t.shop.cart.pickupTitle}</strong>
            <span className="secondary">
              {workshop?.address ? `${workshop.address}. ` : ''}
              {t.shop.cart.pickupText}
            </span>
          </span>
        </div>
        <p className="notice notice--info cart-info" role="status">
          <Info size={18} aria-hidden="true" />
          <span>{t.shop.cart.info}</span>
        </p>
        <label className="field">
          <span className="field__label">
            {t.shop.cart.comment} <span className="secondary">({t.shop.cart.commentHint})</span>
          </span>
          <textarea
            className="field__input"
            rows={2}
            maxLength={300}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </label>
      </section>
      <BottomBar
        summary={
          <span className="summary__row">
            <span className="secondary">{t.shop.cart.total}</span>
            <span className="num price-lg">
              {quote.data ? formatMoney(quote.data.subtotal, lang) : ''}
            </span>
          </span>
        }
      >
        <Button
          busy={order.isPending}
          disabled={!quote.data?.canOrder || quote.isFetching}
          onClick={() => order.mutate()}
        >
          {t.shop.cart.order}
        </Button>
      </BottomBar>
    </PhoneGate>
  );
}
