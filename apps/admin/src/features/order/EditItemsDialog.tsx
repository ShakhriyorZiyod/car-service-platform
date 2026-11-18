import type { AdminOrder } from '@cs/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { call } from '../../api';
import { useLang, useT } from '../../i18n';
import { apiMessage, genericMessage } from '../../lib/errors';
import { CATALOG_KEY } from '../../lib/keys';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { ZonePicker } from '../../ui/ZonePicker';

interface Edit {
  price: string;
  comment: string;
}

/**
 * The zones of an order and what each costs. A zone already in the order keeps the price it was
 * sold at; a new one is priced from the list; a price typed here wins. The time and the box are
 * worked out again by the server.
 */
export function EditItemsDialog({
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
  const catalog = useQuery({
    queryKey: CATALOG_KEY,
    queryFn: () => call('admin.catalog'),
    staleTime: 5 * 60_000,
  });

  const original = new Map(
    order.items.map((item) => [
      item.serviceId,
      { price: item.price === null ? '' : String(item.price), comment: item.comment ?? '' },
    ]),
  );
  const [selected, setSelected] = useState<string[]>(order.items.map((item) => item.serviceId));
  const [edits, setEdits] = useState<Record<string, Edit>>(() => Object.fromEntries(original));

  const nameOf = (serviceId: string) => {
    const zone = catalog.data?.serviceTypes
      .flatMap((type) => type.zones)
      .find((candidate) => candidate.id === serviceId);
    if (zone) return lang === 'ru' ? zone.nameRu : zone.nameUz;
    const item = order.items.find((candidate) => candidate.serviceId === serviceId);
    return item ? (lang === 'ru' ? item.nameRu : item.nameUz) : serviceId;
  };
  const editOf = (serviceId: string): Edit => edits[serviceId] ?? { price: '', comment: '' };
  const setEdit = (serviceId: string, patch: Partial<Edit>) =>
    setEdits((previous) => ({ ...previous, [serviceId]: { ...editOf(serviceId), ...patch } }));

  const save = useMutation({
    mutationFn: () =>
      call('admin.updateOrderItems', {
        params: { id: order.id },
        body: {
          items: selected.map((serviceId) => {
            const edit = editOf(serviceId);
            const before = original.get(serviceId);
            const price = edit.price.trim();
            const priceChanged = price !== '' && price !== before?.price && /^\d+$/.test(price);
            const commentChanged = edit.comment.trim() !== (before?.comment ?? '').trim();
            return {
              serviceId,
              // Left out: the price the order has, or the list's for a zone that is new.
              ...(priceChanged && { price: Number(price) }),
              ...(commentChanged && { comment: edit.comment.trim() || null }),
            };
          }),
        },
      }),
    onSuccess: (updated) => {
      onSaved(updated);
      onClose();
    },
  });

  return (
    <Dialog title={t.order.editItems.title} onClose={onClose} wide>
      <div className="form-stack">
        {catalog.isError && <Notice tone="danger">{genericMessage(catalog.error, t)}</Notice>}
        {catalog.data && (
          <ZonePicker
            catalog={catalog.data}
            bodyClass={order.bodyClass}
            selected={selected}
            onChange={(ids) => {
              setSelected(ids);
              save.reset();
            }}
          />
        )}

        <h3 className="section-title">{t.order.editItems.selected(selected.length)}</h3>
        <ul className="edit-items">
          {selected.map((serviceId) => (
            <li key={serviceId} className="edit-items__row">
              <span className="edit-items__name">{nameOf(serviceId)}</span>
              <Field
                label={t.order.editItems.price}
                inputMode="numeric"
                value={editOf(serviceId).price}
                onChange={(event) =>
                  setEdit(serviceId, { price: event.target.value.replace(/\D/g, '') })
                }
              />
              <Field
                label={t.order.editItems.comment}
                value={editOf(serviceId).comment}
                maxLength={500}
                onChange={(event) => setEdit(serviceId, { comment: event.target.value })}
              />
            </li>
          ))}
        </ul>
        <p className="muted">
          {t.order.editItems.priceHint} {t.order.editItems.note}
        </p>
        {save.isError && <Notice tone="danger">{apiMessage(save.error, t)}</Notice>}
        <div className="dialog__actions">
          <Button variant="secondary" onClick={onClose}>
            {t.form.cancel}
          </Button>
          <Button
            busy={save.isPending}
            disabled={selected.length === 0}
            onClick={() => save.mutate()}
          >
            {t.order.editItems.submit}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
