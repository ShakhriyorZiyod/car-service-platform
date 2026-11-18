import type { Holiday, WorkDay, WorkHours } from '@cs/shared';
import { formatDateLong } from '@cs/shared/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { call } from '../../api';
import { useLang, useT } from '../../i18n';
import { genericMessage, invalidPaths } from '../../lib/errors';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Notice } from '../../ui/Notice';

const HOURS_KEY = ['work-hours'] as const;
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

interface RowDraft {
  works: boolean;
  open: string;
  close: string;
  hasBreak: boolean;
  breakStart: string;
  breakEnd: string;
}

/** What a day off becomes when it is switched on. */
const NEW_DAY: RowDraft = {
  works: true,
  open: '09:00',
  close: '20:00',
  hasBreak: false,
  breakStart: '13:00',
  breakEnd: '14:00',
};

type Rows = Record<number, RowDraft>;

function rowsOf(days: readonly WorkDay[]): Rows {
  const rows: Rows = {};
  for (const weekday of WEEKDAYS) {
    const day = days.find((entry) => entry.weekday === weekday);
    rows[weekday] = day
      ? {
          works: true,
          open: day.open,
          close: day.close,
          hasBreak: day.breakStart !== null,
          breakStart: day.breakStart ?? NEW_DAY.breakStart,
          breakEnd: day.breakEnd ?? NEW_DAY.breakEnd,
        }
      : { ...NEW_DAY, works: false };
  }
  return rows;
}

/** The days the draft says are working, in weekday order. */
function daysOf(rows: Rows): WorkDay[] {
  return WEEKDAYS.flatMap((weekday) => {
    const row = rows[weekday];
    if (!row?.works) return [];
    return [
      {
        weekday,
        open: row.open,
        close: row.close,
        breakStart: row.hasBreak ? row.breakStart : null,
        breakEnd: row.hasBreak ? row.breakEnd : null,
      },
    ];
  });
}

/** "Ish jadvali va bayramlar": the week's hours and the days the workshop is closed (PLAN 7.4). */
export function HoursTab() {
  const t = useT();
  const hours = useQuery({ queryKey: HOURS_KEY, queryFn: () => call('admin.workHours') });
  if (hours.isPending) return <p className="muted">{t.form.loading}</p>;
  if (hours.isError) return <Notice tone="danger">{genericMessage(hours.error, t)}</Notice>;
  return (
    <div className="hours">
      <WeekCard hours={hours.data} />
      <HolidaysCard holidays={hours.data.holidays} />
    </div>
  );
}

function WeekCard({ hours }: { hours: WorkHours }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Rows>(() => rowsOf(hours.days));
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () => call('admin.updateWorkHours', { body: { days: daysOf(rows) } }),
    onSuccess: (result) => {
      queryClient.setQueryData(HOURS_KEY, result);
      setRows(rowsOf(result.days));
      setSaved(true);
    },
    onError: () => setSaved(false),
  });

  const change = (weekday: number, update: Partial<RowDraft>) => {
    setSaved(false);
    setRows((previous) => ({
      ...previous,
      [weekday]: { ...(previous[weekday] ?? NEW_DAY), ...update },
    }));
  };

  // The server names the entry by its place in the list it was sent, which skips the days off.
  const sent = daysOf(rows);
  const invalidWeekdays = new Set(
    [...invalidPaths(save.error)].flatMap((path) => {
      const index = /^body\.days\.(\d+)\./.exec(path)?.[1];
      const day = index === undefined ? undefined : sent[Number(index)];
      return day ? [day.weekday] : [];
    }),
  );
  const dirty = JSON.stringify(sent) !== JSON.stringify(hours.days);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <form className="card hours__card" onSubmit={submit}>
      <header className="hours__head">
        <h2 className="section-title">{t.hours.weekTitle}</h2>
        <p className="muted">{t.hours.weekLead}</p>
      </header>
      {saved && <Notice tone="success">{t.form.saved}</Notice>}
      {save.error && <Notice tone="danger">{genericMessage(save.error, t)}</Notice>}

      <table className="hours__table">
        <tbody>
          {WEEKDAYS.map((weekday) => {
            const row = rows[weekday] ?? NEW_DAY;
            const invalid = invalidWeekdays.has(weekday);
            return (
              <tr key={weekday} className={row.works ? undefined : 'is-off'}>
                <th scope="row">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={row.works}
                      onChange={(event) => change(weekday, { works: event.target.checked })}
                    />
                    <span className="hours__day">
                      {t.hours.weekdays[WEEKDAY_KEYS[weekday - 1] ?? 'mon']}
                    </span>
                  </label>
                </th>
                {row.works ? (
                  <td>
                    <div className="hours__times">
                      <TimeInput
                        label={t.hours.open}
                        value={row.open}
                        invalid={invalid}
                        onChange={(open) => change(weekday, { open })}
                      />
                      <TimeInput
                        label={t.hours.close}
                        value={row.close}
                        invalid={invalid}
                        onChange={(close) => change(weekday, { close })}
                      />
                      <label className="check hours__break-toggle">
                        <input
                          type="checkbox"
                          checked={row.hasBreak}
                          onChange={(event) => change(weekday, { hasBreak: event.target.checked })}
                        />
                        {t.hours.hasBreak}
                      </label>
                      {row.hasBreak && (
                        <>
                          <TimeInput
                            label={t.hours.breakStart}
                            value={row.breakStart}
                            invalid={invalid}
                            onChange={(breakStart) => change(weekday, { breakStart })}
                          />
                          <TimeInput
                            label={t.hours.breakEnd}
                            value={row.breakEnd}
                            invalid={invalid}
                            onChange={(breakEnd) => change(weekday, { breakEnd })}
                          />
                        </>
                      )}
                    </div>
                    {invalid && <p className="field__error">{t.hours.rowInvalid}</p>}
                  </td>
                ) : (
                  <td className="muted">{t.hours.dayOff}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="hours__actions">
        <Button type="submit" busy={save.isPending} disabled={!dirty}>
          {t.form.save}
        </Button>
      </div>
    </form>
  );
}

function TimeInput({
  label,
  value,
  invalid,
  onChange,
}: {
  label: string;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="hours__time">
      <span className="muted">{label}</span>
      <input
        type="time"
        required
        step={60}
        value={value}
        className={invalid ? 'field__input is-invalid' : 'field__input'}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function HolidaysCard({ holidays }: { holidays: readonly Holiday[] }) {
  const t = useT();
  const lang = useLang();
  const queryClient = useQueryClient();
  const [date, setDate] = useState('');
  const [name, setName] = useState('');

  const refresh = () => queryClient.invalidateQueries({ queryKey: HOURS_KEY });
  const add = useMutation({
    mutationFn: () => call('admin.addHoliday', { body: { date, name } }),
    onSuccess: async () => {
      setDate('');
      setName('');
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (holidayDate: string) =>
      call('admin.removeHoliday', { params: { date: holidayDate } }),
    onSuccess: refresh,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    add.mutate();
  };

  return (
    <section className="card hours__card">
      <header className="hours__head">
        <h2 className="section-title">{t.hours.holidaysTitle}</h2>
        <p className="muted">{t.hours.holidaysLead}</p>
      </header>
      {(add.error ?? remove.error) && (
        <Notice tone="danger">{genericMessage(add.error ?? remove.error, t)}</Notice>
      )}

      {holidays.length === 0 ? (
        <p className="muted">{t.hours.noHolidays}</p>
      ) : (
        <ul className="hours__holidays">
          {holidays.map((holiday) => (
            <li key={holiday.date}>
              <span className="hours__holiday-date">{formatDateLong(holiday.date, lang)}</span>
              <span>{holiday.name}</span>
              <Button
                variant="ghost"
                aria-label={`${t.form.remove}: ${holiday.name}`}
                icon={<Trash2 size={16} aria-hidden="true" />}
                busy={remove.isPending && remove.variables === holiday.date}
                onClick={() => remove.mutate(holiday.date)}
              />
            </li>
          ))}
        </ul>
      )}

      <form className="hours__add" onSubmit={submit}>
        <Field
          label={t.hours.holidayDate}
          type="date"
          required
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
        <Field
          label={t.hours.holidayName}
          required
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" variant="secondary" busy={add.isPending}>
          {t.hours.addHoliday}
        </Button>
      </form>
    </section>
  );
}
