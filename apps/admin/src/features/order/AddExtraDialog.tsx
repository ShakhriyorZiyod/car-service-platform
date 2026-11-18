import type { AdminOrder } from '@cs/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { call } from '../../api';
import { useLang, useT } from '../../i18n';
import { apiMessage } from '../../lib/errors';
import { CATALOG_KEY, ORDERS_KEY, orderKey } from '../../lib/keys';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { SelectField } from '../../ui/SelectField';

/** Extra work found on the car: the client is asked, and it counts only if they agree (PLAN 9.3). */
export function AddExtraDialog({ order, onClose }: { order: AdminOrder; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const queryClient = useQueryClient();
  const d = t.work.extras.dialog;
  const catalog = useQuery({
    queryKey: CATALOG_KEY,
    queryFn: () => call('admin.catalog'),
    staleTime: 5 * 60_000,
  });
  const [serviceId, setServiceId] = useState('');
  const [price, setPrice] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [comment, setComment] = useState('');

  const add = useMutation({
    mutationFn: () =>
      call('admin.addExtraItem', {
        params: { id: order.id },
        body: {
          serviceId,
          ...(agreed ? { price: null } : /^\d+$/.test(price) ? { price: Number(price) } : {}),
          ...(comment.trim() && { comment: comment.trim() }),
        },
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: orderKey(order.id) }),
        queryClient.invalidateQueries({ queryKey: ORDERS_KEY }),
      ]);
      onClose();
    },
  });

  // Only the zones the car's class is offered, grouped by kind of work.
  const groups =
    catalog.data?.serviceTypes
      .map((type) => ({
        type,
        zones: type.zones.filter((zone) =>
          zone.prices.some((cell) => cell.bodyClass === order.bodyClass),
        ),
      }))
      .filter((group) => group.zones.length > 0) ?? [];

  return (
    <Dialog title={d.title} onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (serviceId) add.mutate();
        }}
      >
        <SelectField
          label={d.zone}
          value={serviceId}
          onChange={(event) => setServiceId(event.target.value)}
        >
          <option value="">{d.chooseZone}</option>
          {groups.map(({ type, zones }) => (
            <optgroup key={type.id} label={lang === 'ru' ? type.nameRu : type.nameUz}>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {lang === 'ru' ? zone.nameRu : zone.nameUz}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectField>
        <Field
          label={d.price}
          hint={d.priceHint}
          inputMode="numeric"
          value={price}
          disabled={agreed}
          onChange={(event) => setPrice(event.target.value.replace(/\D/g, ''))}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
          />
          <span className="check__text">{d.agreed}</span>
        </label>
        <Field
          label={d.comment}
          value={comment}
          maxLength={300}
          onChange={(event) => setComment(event.target.value)}
        />
        {add.isError && <Notice tone="danger">{apiMessage(add.error, t)}</Notice>}
        <div className="dialog__actions">
          <Button variant="secondary" onClick={onClose}>
            {t.form.cancel}
          </Button>
          <Button type="submit" busy={add.isPending} disabled={!serviceId}>
            {d.submit}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
