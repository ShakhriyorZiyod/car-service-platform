import type { Order } from '@cs/shared';
import { formatMoney } from '@cs/shared/format';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../../bootstrap';
import { useLang, useT } from '../../../i18n';
import { errorText, orderKey, pick } from '../../../lib/client-data';
import { Button } from '../../../ui/Button';
import { Notice } from '../../../ui/Notice';

/**
 * T6, ApprovalCard: extra work the workshop found, which is done only if the client agrees
 * (docs/PLAN.md, section 9.3). The new total is what the order would cost with it.
 */
export function ExtraApproval({ order, item }: { order: Order; item: Order['items'][number] }) {
  const t = useT().client;
  const lang = useLang();
  const api = useApi();
  const queryClient = useQueryClient();
  const e = t.orders.extra;
  const answer = useMutation({
    mutationFn: (decision: 'approve' | 'reject') =>
      api.call('client.decideExtra', {
        params: { id: order.id, itemId: item.id },
        body: { decision },
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(orderKey(order.id), updated);
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    // Answered in the bot meanwhile: show what it is now.
    onError: () => queryClient.invalidateQueries({ queryKey: orderKey(order.id) }),
  });
  const name = pick(lang, { uz: item.nameUz, ru: item.nameRu });

  return (
    <div className="card approval">
      <h2 className="title">{e.title}</h2>
      <p>{e.ask}</p>
      <div className="approval__what">
        <strong>{name}</strong>
        <span className="num">
          {item.price === null ? t.common.agreed : formatMoney(item.price, lang)}
        </span>
      </div>
      <p className="secondary">
        {e.newTotal}:{' '}
        <span className="num">{formatMoney(item.totalIfApproved ?? order.total, lang)}</span>
      </p>
      {answer.isError && <Notice tone="danger">{errorText(t, answer.error)}</Notice>}
      <div className="approval__buttons">
        <Button
          variant="secondary"
          disabled={answer.isPending}
          onClick={() => answer.mutate('reject')}
        >
          {e.reject}
        </Button>
        <Button busy={answer.isPending} onClick={() => answer.mutate('approve')}>
          {e.approve}
        </Button>
      </div>
    </div>
  );
}
