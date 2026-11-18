import type { Order } from '@cs/shared';
import { formatMoney } from '@cs/shared/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt, Star } from 'lucide-react';
import { useState } from 'react';
import { useApi } from '../../../bootstrap';
import { useLang, useT } from '../../../i18n';
import { errorText, orderKey, pick } from '../../../lib/client-data';
import { Button } from '../../../ui/Button';
import { BottomBar } from '../../../ui/client-parts';
import { Notice } from '../../../ui/Notice';

const RESULT_KEY = (orderId: string) => ['order-result', orderId] as const;

/**
 * T12: the finished order (client PDF, page 13). The work's photos before and after, what was
 * paid and the fiscal receipt's number, and the rating: stars and, if the client likes, words.
 * Stars given in the bot are shown, and their words can still be added here.
 */
export function ResultSection({ order, onBook }: { order: Order; onBook: () => void }) {
  const t = useT().client;
  const lang = useLang();
  const api = useApi();
  const result = useQuery({
    queryKey: RESULT_KEY(order.id),
    queryFn: () => api.call('client.orderResult', { params: { id: order.id } }),
  });
  const r = t.orders.result;
  const data = result.data;

  return (
    <>
      {result.isError && <Notice tone="danger">{errorText(t, result.error)}</Notice>}
      {data && data.photos.length > 0 && (
        <div className="card result">
          {data.photos.map((task) => (
            <section key={task.taskId} className="result__task">
              <h2 className="title">
                {task.items
                  .map((item) => pick(lang, { uz: item.nameUz, ru: item.nameRu }))
                  .join(', ')}
              </h2>
              <div className="result__pair">
                <PhotoColumn label={r.before} photos={task.before} />
                <PhotoColumn label={r.after} photos={task.after} after />
              </div>
            </section>
          ))}
        </div>
      )}
      {data && data.payments.length > 0 && (
        <div className="card result__paid">
          <div className="summary__row">
            <span className="secondary">
              {r.paid(data.payments.map((line) => r.methods[line.method]).join(', '))}
            </span>
            <span className="num-xl">{formatMoney(order.total, lang)}</span>
          </div>
          {data.receiptNo && (
            <p className="result__receipt">
              <Receipt size={18} aria-hidden="true" />
              {r.receipt(data.receiptNo)}
            </p>
          )}
        </div>
      )}
      <Rating order={order} onBook={onBook} />
    </>
  );
}

function PhotoColumn({
  label,
  photos,
  after = false,
}: {
  label: string;
  photos: readonly { mediaId: string; url: string }[];
  after?: boolean;
}) {
  const t = useT().client;
  return (
    <figure className="result__column">
      {photos.length === 0 ? (
        <div className="result__empty secondary">{t.orders.result.noPhoto}</div>
      ) : (
        <ul className="result__photos">
          {photos.map((photo) => (
            <li key={photo.mediaId}>
              <a href={photo.url} target="_blank" rel="noreferrer">
                <img src={photo.url} alt={label} loading="lazy" />
              </a>
            </li>
          ))}
        </ul>
      )}
      <figcaption className={after ? 'result__label is-after' : 'result__label'}>
        {label}
      </figcaption>
    </figure>
  );
}

/** "Ish qanday bo‘ldi?": five stars once; words with them, or after the stars from the bot. */
function Rating({ order, onBook }: { order: Order; onBook: () => void }) {
  const t = useT().client;
  const api = useApi();
  const queryClient = useQueryClient();
  const r = t.orders.result;
  const [stars, setStars] = useState<number | null>(order.review?.rating ?? null);
  const [text, setText] = useState('');
  const send = useMutation({
    mutationFn: () =>
      api.call('client.review', {
        params: { id: order.id },
        body: { rating: stars ?? 0, ...(text.trim() && { text: text.trim() }) },
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(orderKey(order.id), updated);
      setText('');
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    // Rated in the bot meanwhile: show what it is now.
    onError: () => queryClient.invalidateQueries({ queryKey: orderKey(order.id) }),
  });

  const shown = order.review?.rating ?? stars;
  const again = (
    <Button variant="secondary" onClick={onBook}>
      {r.bookAgain}
    </Button>
  );

  return (
    <div className="card form-stack">
      <h2 className="title">{r.ask}</h2>
      <div className="rating" role="radiogroup" aria-label={r.ask}>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={shown === value}
            aria-label={r.stars(value)}
            className={shown !== null && value <= shown ? 'rating__star is-on' : 'rating__star'}
            disabled={!order.canRate}
            onClick={() => setStars(value)}
          >
            <Star size={24} aria-hidden="true" />
          </button>
        ))}
      </div>
      {order.review?.text && <p className="result__said">«{order.review.text}»</p>}
      {(order.canRate || order.canComment) && (
        <label className="field">
          <span className="field__label">{r.comment}</span>
          <span className="secondary">{r.optional}</span>
          <textarea
            className="field__input"
            rows={3}
            maxLength={1000}
            placeholder={r.placeholder}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
      )}
      {!order.canRate && !order.canComment && <p className="secondary">{r.thanks}</p>}
      {send.isError && <Notice tone="danger">{errorText(t, send.error)}</Notice>}
      <BottomBar>
        {order.canRate || order.canComment ? (
          <div className="bar-pair">
            {again}
            <Button
              disabled={order.canRate ? stars === null : text.trim() === ''}
              busy={send.isPending}
              onClick={() => send.mutate()}
            >
              {order.canRate ? r.send : r.sendComment}
            </Button>
          </div>
        ) : (
          again
        )}
      </BottomBar>
    </div>
  );
}
