import type { AdminOrder } from '@cs/shared';
import { formatDuration } from '@cs/shared/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { call } from '../../api';
import { useLang, useT } from '../../i18n';
import { apiMessage } from '../../lib/errors';
import { MASTERS_KEY, ORDERS_KEY, TASKS_KEY, orderKey } from '../../lib/keys';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Notice } from '../../ui/Notice';
import { SelectField } from '../../ui/SelectField';

/** Gives one or several zones of the order to a master (PLAN 9.2). */
export function GiveTaskDialog({
  order,
  free,
  onClose,
}: {
  order: AdminOrder;
  free: AdminOrder['items'];
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const queryClient = useQueryClient();
  const d = t.work.tasks.dialog;
  const masters = useQuery({
    queryKey: MASTERS_KEY,
    queryFn: () => call('admin.masters'),
    staleTime: 60_000,
  });
  const [masterId, setMasterId] = useState('');
  const [assistantId, setAssistantId] = useState('');
  const [itemIds, setItemIds] = useState<string[]>(free.map((item) => item.id));
  const [instruction, setInstruction] = useState('');

  const give = useMutation({
    mutationFn: () =>
      call('admin.createTask', {
        params: { id: order.id },
        body: {
          masterId,
          ...(assistantId && { assistantId }),
          itemIds,
          instruction: instruction.trim(),
        },
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: orderKey(order.id) }),
        queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
        queryClient.invalidateQueries({ queryKey: ORDERS_KEY }),
      ]);
      onClose();
    },
    // Someone else gave a zone meanwhile: show what is left.
    onError: () => queryClient.invalidateQueries({ queryKey: orderKey(order.id) }),
  });

  const norm = free
    .filter((item) => itemIds.includes(item.id))
    .reduce((sum, item) => sum + item.durationMin, 0);
  const people = masters.data?.items ?? [];

  return (
    <Dialog title={d.title} onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (masterId && itemIds.length > 0) give.mutate();
        }}
      >
        {masters.isSuccess && people.length === 0 && <Notice tone="warning">{d.noMasters}</Notice>}
        <SelectField
          label={d.master}
          value={masterId}
          onChange={(event) => setMasterId(event.target.value)}
        >
          <option value="">{d.chooseMaster}</option>
          {people.map((master) => (
            <option key={master.id} value={master.id}>
              {master.fullName}
              {master.specialization ? ` · ${master.specialization}` : ''}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={d.assistant}
          value={assistantId}
          onChange={(event) => setAssistantId(event.target.value)}
        >
          <option value="">{d.none}</option>
          {people
            .filter((master) => master.id !== masterId)
            .map((master) => (
              <option key={master.id} value={master.id}>
                {master.fullName}
              </option>
            ))}
        </SelectField>
        <fieldset className="checks checks--list">
          <legend className="field__label">{d.items}</legend>
          {free.length === 0 && <p className="muted">{d.noItems}</p>}
          {free.map((item) => (
            <label key={item.id} className="check">
              <input
                type="checkbox"
                checked={itemIds.includes(item.id)}
                onChange={(event) =>
                  setItemIds(
                    event.target.checked
                      ? [...itemIds, item.id]
                      : itemIds.filter((candidate) => candidate !== item.id),
                  )
                }
              />
              <span className="check__text">
                <span>{lang === 'ru' ? item.nameRu : item.nameUz}</span>
                <span className="muted">{formatDuration(item.durationMin, lang)}</span>
              </span>
            </label>
          ))}
          {itemIds.length > 0 && (
            <p className="muted">
              {t.tasks.norm}: {formatDuration(norm, lang)}
            </p>
          )}
        </fieldset>
        <div className="field">
          <label className="field__label" htmlFor="instruction">
            {d.instruction}
          </label>
          <textarea
            id="instruction"
            className="field__input field__input--area"
            rows={3}
            maxLength={1000}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
          />
        </div>
        {give.isError && <Notice tone="danger">{apiMessage(give.error, t)}</Notice>}
        <div className="dialog__actions">
          <Button variant="secondary" onClick={onClose}>
            {t.form.cancel}
          </Button>
          <Button type="submit" busy={give.isPending} disabled={!masterId || itemIds.length === 0}>
            {d.submit}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
