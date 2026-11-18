import type { AdminOrder, Slot } from '@cs/shared';
import { formatDateLong } from '@cs/shared/format';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { call } from '../../api';
import { useLang, useT } from '../../i18n';
import { apiMessage } from '../../lib/errors';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Notice } from '../../ui/Notice';
import { SlotPicker } from '../../ui/SlotPicker';

/** Moves the order to another free time; the old time stays when the new one is taken. */
export function RescheduleDialog({
  order,
  onClose,
  onSaved,
}: {
  order: AdminOrder;
  onClose: () => void;
  onSaved: (order: AdminOrder) => void;
}) {
  const t = useT();
  const lang = useLang();
  const [slot, setSlot] = useState<Slot | null>(null);

  const move = useMutation({
    mutationFn: (startsAt: string) =>
      call('admin.rescheduleOrder', { params: { id: order.id }, body: { startsAt } }),
    onSuccess: (updated) => {
      onSaved(updated);
      onClose();
    },
  });

  return (
    <Dialog title={t.order.reschedule.title} onClose={onClose} wide>
      <div className="form-stack">
        <p className="muted">
          {t.order.reschedule.current(
            `${formatDateLong(order.startsAt.date, lang)}, ${order.startsAt.time}`,
          )}
        </p>
        <SlotPicker
          bodyClass={order.bodyClass}
          serviceIds={order.items.map((item) => item.serviceId)}
          value={slot}
          onChange={(next) => {
            setSlot(next);
            move.reset();
          }}
          exceptOrderId={order.id}
        />
        {move.isError && <Notice tone="danger">{apiMessage(move.error, t)}</Notice>}
        <div className="dialog__actions">
          <Button variant="secondary" onClick={onClose}>
            {t.form.cancel}
          </Button>
          <Button
            busy={move.isPending}
            disabled={slot === null}
            onClick={() => slot && move.mutate(slot.startsAt.at)}
          >
            {t.order.reschedule.submit}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
