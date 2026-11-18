import type { AdminOrder } from '@cs/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { call } from '../api';
import { useT } from '../i18n';
import { apiMessage } from '../lib/errors';
import { ORDERS_KEY, TODAY_KEY, orderKey } from '../lib/keys';
import { ReasonDialog } from './ReasonDialog';

type Outcome = 'confirmed' | 'no_answer' | 'rejected';

/**
 * "Confirmed", "No answer", "Rejected" (docs/DESIGN.md, CallActions): the admin's three answers
 * after calling the client. "Rejected" asks for the reason first.
 */
export function CallActions({ order, compact = false }: { order: AdminOrder; compact?: boolean }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState(false);

  const answer = useMutation({
    mutationFn: (input: { outcome: Outcome; reasonId?: string; note?: string | null }) =>
      call('admin.callOrder', {
        params: { id: order.id },
        body: {
          outcome: input.outcome,
          ...(input.reasonId && { reasonId: input.reasonId }),
          ...(input.note && { note: input.note }),
        },
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(orderKey(order.id), updated);
      setRejecting(false);
    },
    // The order may have been answered by someone else meanwhile: show what it is now.
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ORDERS_KEY }),
        queryClient.invalidateQueries({ queryKey: TODAY_KEY }),
        queryClient.invalidateQueries({ queryKey: orderKey(order.id) }),
      ]);
    },
  });

  if (!order.actions.canCall) return null;
  const busy = answer.isPending;
  return (
    <div className={compact ? 'call-actions call-actions--compact' : 'call-actions'}>
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
          title={t.orders.reject.title(order.number)}
          submitLabel={t.orders.reject.submit}
          pending={answer.isPending}
          error={answer.error}
          onClose={() => {
            setRejecting(false);
            answer.reset();
          }}
          onSubmit={({ reasonId, note }) => answer.mutate({ outcome: 'rejected', reasonId, note })}
        />
      )}
    </div>
  );
}
