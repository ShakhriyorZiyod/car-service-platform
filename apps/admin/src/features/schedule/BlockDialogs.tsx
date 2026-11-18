import type { Schedule } from '@cs/shared';
import { formatDateLong } from '@cs/shared/format';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { call } from '../../api';
import { useCan } from '../../auth/session';
import { useLang, useT } from '../../i18n';
import { apiMessage, invalidFields } from '../../lib/errors';
import { SCHEDULE_KEY, TODAY_KEY } from '../../lib/keys';
import { instantFor, minutesOf } from '../../lib/time';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { SelectField } from '../../ui/SelectField';

type Item = Schedule['boxes'][number]['items'][number];

/** Holds a box for a time with a reason (a broken lift): nobody can book it meanwhile. */
export function BlockDialog({
  schedule,
  hours,
  onClose,
}: {
  schedule: Schedule;
  hours: NonNullable<Schedule['hours']>;
  onClose: () => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const [boxId, setBoxId] = useState(schedule.boxes[0]?.id ?? '');
  const [from, setFrom] = useState(hours.open);
  const [to, setTo] = useState(hours.close);
  const [note, setNote] = useState('');

  const create = useMutation({
    mutationFn: () =>
      call('admin.createBlock', {
        body: {
          boxId,
          startsAt: instantFor(schedule.date, from),
          endsAt: instantFor(schedule.date, to),
          note: note.trim(),
        },
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: SCHEDULE_KEY }),
        queryClient.invalidateQueries({ queryKey: TODAY_KEY }),
        queryClient.invalidateQueries({ queryKey: ['slots'] }),
        queryClient.invalidateQueries({ queryKey: ['availability'] }),
      ]);
      onClose();
    },
  });
  const invalid = invalidFields(create.error);
  const orderOk = from !== '' && to !== '' && minutesOf(to) > minutesOf(from);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (orderOk && note.trim() !== '') create.mutate();
  };

  return (
    <Dialog title={t.schedule.block.title} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <SelectField
          label={t.schedule.block.box}
          value={boxId}
          onChange={(event) => setBoxId(event.target.value)}
        >
          {schedule.boxes.map((box) => (
            <option key={box.id} value={box.id}>
              {box.name}
            </option>
          ))}
        </SelectField>
        <div className="form-row">
          <Field
            label={t.schedule.block.from}
            type="time"
            step={900}
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
          <Field
            label={t.schedule.block.to}
            type="time"
            step={900}
            value={to}
            error={!orderOk ? t.schedule.block.timeOrder : null}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
        <Field
          label={t.schedule.block.note}
          hint={t.schedule.block.noteHint}
          value={note}
          maxLength={500}
          error={invalid.has('note') ? t.errors.validation : null}
          onChange={(event) => setNote(event.target.value)}
        />
        {create.isError && <Notice tone="danger">{apiMessage(create.error, t)}</Notice>}
        <div className="dialog__actions">
          <Button variant="secondary" onClick={onClose}>
            {t.form.cancel}
          </Button>
          <Button type="submit" busy={create.isPending} disabled={!orderOk || note.trim() === ''}>
            {t.schedule.block.submit}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** A block on the table: why it is there, and a way to lift it. */
export function BlockDetailDialog({
  date,
  item,
  boxName,
  onClose,
}: {
  date: string;
  item: Item;
  boxName: string;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const can = useCan();
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: () => call('admin.removeBlock', { params: { id: item.id } }),
    // Gone already (someone else lifted it) is as good: the table refreshes either way.
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: SCHEDULE_KEY }),
        queryClient.invalidateQueries({ queryKey: ['slots'] }),
        queryClient.invalidateQueries({ queryKey: ['availability'] }),
      ]);
    },
    onSuccess: onClose,
  });

  return (
    <Dialog title={t.schedule.block.detail} onClose={onClose}>
      <div className="form-stack">
        <p>
          <strong>{boxName}</strong>
          <br />
          <span className="num">
            {item.startsAt.date !== date && `${formatDateLong(item.startsAt.date, lang)}, `}
            {item.startsAt.time} –{' '}
            {item.endsAt.date !== date && `${formatDateLong(item.endsAt.date, lang)}, `}
            {item.endsAt.time}
          </span>
        </p>
        {item.note && <p>{item.note}</p>}
        {remove.isError && <Notice tone="danger">{apiMessage(remove.error, t)}</Notice>}
        <div className="dialog__actions">
          <Button variant="secondary" onClick={onClose}>
            {t.common.close}
          </Button>
          {can('schedule.write') && (
            <Button busy={remove.isPending} onClick={() => remove.mutate()}>
              {t.schedule.block.remove}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
