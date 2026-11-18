import type { Slot } from '@cs/shared';
import { formatDateLong, weekdayShort } from '@cs/shared/format';
import type { BodyClass } from '@cs/shared/vocabulary';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { call } from '../api';
import { useLang, useT } from '../i18n';
import { genericMessage } from '../lib/errors';
import { weekdayOfDate } from '../lib/time';
import { Notice } from './Notice';

/**
 * The days the workshop works and the free start times of one day, for a job. The staff see the
 * times a client would not be offered yet (a client at the door), never past ones.
 */
export function SlotPicker({
  bodyClass,
  serviceIds,
  value,
  onChange,
  exceptOrderId,
}: {
  bodyClass: BodyClass;
  serviceIds: readonly string[];
  value: Slot | null;
  onChange: (slot: Slot | null) => void;
  /** Moving an order: its own booking does not hold its new time. */
  exceptOrderId?: string;
}) {
  const t = useT();
  const lang = useLang();
  const [picked, setPicked] = useState<string | null>(null);
  const serviceIdsParam = serviceIds.join(',');

  const availability = useQuery({
    queryKey: ['availability', bodyClass, serviceIdsParam],
    queryFn: () =>
      call('admin.availability', { query: { bodyClass, serviceIds: serviceIdsParam } }),
    enabled: serviceIds.length > 0,
  });
  const days = availability.data?.days ?? [];
  const date =
    picked ?? value?.startsAt.date ?? days.find((day) => day.state === 'free')?.date ?? null;

  const slots = useQuery({
    queryKey: ['slots', bodyClass, serviceIdsParam, date, exceptOrderId ?? null],
    queryFn: () =>
      call('admin.slots', {
        query: {
          bodyClass,
          serviceIds: serviceIdsParam,
          date: date ?? '',
          ...(exceptOrderId && { exceptOrderId }),
        },
      }),
    enabled: serviceIds.length > 0 && date !== null,
  });

  const pickDate = (next: string) => {
    setPicked(next);
    onChange(null);
  };
  const pickSlot = (slot: Slot) => {
    setPicked(slot.startsAt.date);
    onChange(slot);
  };

  if (serviceIds.length === 0) return <p className="muted">{t.slots.chooseCar}</p>;
  if (availability.isError) {
    return <Notice tone="danger">{genericMessage(availability.error, t)}</Notice>;
  }

  const free = slots.data?.slots.filter((slot) => slot.free) ?? [];
  return (
    <div className="slots">
      {availability.data?.multiDay && <Notice tone="info">{t.slots.multiDay}</Notice>}
      <div className="slots__days" role="group" aria-label={t.slots.day}>
        {days.map((day) => (
          <button
            key={day.date}
            type="button"
            disabled={day.state !== 'free'}
            aria-pressed={day.date === date}
            className={day.date === date ? 'slots__day is-active' : 'slots__day'}
            onClick={() => pickDate(day.date)}
          >
            <span className="slots__weekday">{weekdayShort(weekdayOfDate(day.date), lang)}</span>
            <span className="slots__number num">{Number(day.date.slice(8))}</span>
            {day.state === 'full' && <span className="slots__state">{t.slots.full}</span>}
            {day.state === 'closed' && <span className="slots__state">{t.slots.closed}</span>}
          </button>
        ))}
      </div>

      {date && <h3 className="section-title">{formatDateLong(date, lang)}</h3>}
      {slots.isPending && date && <p className="muted">{t.slots.loading}</p>}
      {slots.isError && <Notice tone="danger">{genericMessage(slots.error, t)}</Notice>}
      {slots.data && free.length > 0 && (
        <div className="slots__times" role="group" aria-label={t.slots.time}>
          {free.map((slot) => {
            const active = value?.startsAt.at === slot.startsAt.at;
            return (
              <button
                key={slot.startsAt.at}
                type="button"
                aria-pressed={active}
                className={active ? 'slots__time is-active' : 'slots__time'}
                onClick={() => pickSlot(slot)}
              >
                <span className="num">{slot.startsAt.time}</span>
                {slot.boxName && <span className="slots__box">{slot.boxName}</span>}
              </button>
            );
          })}
        </div>
      )}
      {slots.data && free.length === 0 && (
        <>
          <p className="muted">{t.slots.noSlots}</p>
          {slots.data.nearest.length > 0 && (
            <>
              <h3 className="section-title">{t.slots.nearest}</h3>
              <div className="slots__times">
                {slots.data.nearest.map((slot) => (
                  <button
                    key={slot.startsAt.at}
                    type="button"
                    className="slots__time"
                    onClick={() => pickSlot(slot)}
                  >
                    <span className="num">
                      {slot.startsAt.date.slice(8)}.{slot.startsAt.date.slice(5, 7)}{' '}
                      {slot.startsAt.time}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {value && (
        <p className="slots__chosen">
          <strong className="num">{value.startsAt.time}</strong>{' '}
          <span className="muted">
            {t.slots.ends(
              value.endsAt.date === value.startsAt.date
                ? value.endsAt.time
                : `${formatDateLong(value.endsAt.date, lang)}, ${value.endsAt.time}`,
            )}
          </span>
        </p>
      )}
    </div>
  );
}
