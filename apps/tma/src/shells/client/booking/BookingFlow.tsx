import type { Slot } from '@cs/shared';
import { formatDateLong, formatDuration, formatMoney, weekdayShort } from '@cs/shared/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiRequestError } from '../../../api';
import { useApi } from '../../../bootstrap';
import { useLang, useT } from '../../../i18n';
import { useBack } from '../../../lib/back';
import { clearBookingDraft, loadBookingDraft, saveBookingDraft } from '../../../lib/draft';
import {
  errorText,
  ordersKey,
  pick,
  useCars,
  useCatalog,
  weekdayOfDate,
} from '../../../lib/client-data';
import { Button } from '../../../ui/Button';
import { BottomBar, EmptyState, PlateChip, ScreenHeader, Skeleton } from '../../../ui/client-parts';
import { Notice } from '../../../ui/Notice';
import { PhoneGate } from '../../../ui/PhoneGate';

type Step = 'services' | 'time' | 'confirm';
const TOTAL_STEPS = 3;

/**
 * The booking in three steps (client PDF, T3–T5): the zones, the day and time, and the first
 * receipt. The prices, the minutes and the free times are all the server's: this only shows them.
 */
export function BookingFlow({
  initialCarId,
  onExit,
  onAddCar,
  onSent,
}: {
  initialCarId?: string | undefined;
  onExit: () => void;
  onAddCar: () => void;
  onSent: (orderId: string) => void;
}) {
  const t = useT().client;
  const lang = useLang();
  const api = useApi();
  const queryClient = useQueryClient();
  const cars = useCars();
  const catalog = useCatalog();

  const [step, setStep] = useState<Step>('services');
  const [carId, setCarId] = useState<string | undefined>(initialCarId);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [comment, setComment] = useState('');
  // One key per attempt to place the order: a repeated send gives the same order, not two.
  const requestId = useRef(crypto.randomUUID());

  const car = cars.data?.items.find(
    (candidate) => candidate.id === (carId ?? cars.data.items[0]?.id),
  );
  const types = useMemo(() => catalog.data?.serviceTypes ?? [], [catalog.data]);
  const type = types.find((candidate) => candidate.id === typeId) ?? types[0];

  // An unfinished choice comes back when the client returns (a draft in Telegram's CloudStorage).
  // It is applied once, and only the zones that still exist for the car are kept.
  const draftLoaded = useRef(false);
  useEffect(() => {
    if (draftLoaded.current || !cars.data || !catalog.data) return;
    draftLoaded.current = true;
    const known = new Set(
      catalog.data.serviceTypes.flatMap((kind) => kind.zones.map((zone) => zone.id)),
    );
    void loadBookingDraft().then((draft) => {
      if (!draft) return;
      const ids = draft.serviceIds.filter((id) => known.has(id));
      if (ids.length === 0) return;
      if (draft.carId && cars.data.items.some((candidate) => candidate.id === draft.carId)) {
        setCarId(draft.carId);
      }
      setTypeId(draft.typeId);
      setSelected(ids);
    });
  }, [cars.data, catalog.data]);
  useEffect(() => {
    if (!draftLoaded.current) return;
    void saveBookingDraft({ carId: carId ?? null, typeId, serviceIds: selected });
  }, [carId, typeId, selected]);

  const back = useCallback(
    () => (step === 'services' ? onExit() : setStep(step === 'confirm' ? 'time' : 'services')),
    [step, onExit],
  );
  useBack(back);

  const quote = useQuery({
    queryKey: ['quote', car?.id, selected],
    queryFn: () =>
      api.call('client.quote', { body: { carId: car?.id ?? '', serviceIds: selected } }),
    enabled: car !== undefined && selected.length > 0,
  });

  const serviceIdsParam = selected.join(',');
  const availability = useQuery({
    queryKey: ['availability', car?.id, selected],
    queryFn: () =>
      api.call('client.availability', {
        query: { carId: car?.id ?? '', serviceIds: serviceIdsParam },
      }),
    enabled: step === 'time' && car !== undefined && selected.length > 0,
  });
  const slots = useQuery({
    queryKey: ['slots', car?.id, selected, date],
    queryFn: () =>
      api.call('client.slots', {
        query: { carId: car?.id ?? '', serviceIds: serviceIdsParam, date: date ?? '' },
      }),
    enabled: step === 'time' && car !== undefined && selected.length > 0 && date !== null,
  });

  const send = useMutation({
    mutationFn: () =>
      api.call('client.createOrder', {
        body: {
          requestId: requestId.current,
          carId: car?.id ?? '',
          serviceIds: selected,
          startsAt: slot?.startsAt.at ?? '',
          comment: comment.trim() || null,
        },
      }),
    onSuccess: async (order) => {
      void clearBookingDraft();
      await queryClient.invalidateQueries({ queryKey: ordersKey('active') });
      onSent(order.id);
    },
    onError: (error) => {
      // The time went to somebody else: pick another one, with fresh free times.
      if (
        error instanceof ApiRequestError &&
        (error.code === 'slot_taken' || error.code === 'slot_unavailable')
      ) {
        setSlot(null);
        setStep('time');
        void queryClient.invalidateQueries({ queryKey: ['availability'] });
        void queryClient.invalidateQueries({ queryKey: ['slots'] });
      }
    },
  });

  /** Choosing a zone drops the zones it covers; the server checks the combination again. */
  const zoneById = useMemo(
    () => new Map(types.flatMap((candidate) => candidate.zones.map((zone) => [zone.id, zone]))),
    [types],
  );
  const blocked = (zoneId: string) =>
    selected.some((id) => zoneById.get(id)?.excludes.includes(zoneId));
  const toggle = (zoneId: string) => {
    const zone = zoneById.get(zoneId);
    setSelected((previous) =>
      previous.includes(zoneId)
        ? previous.filter((id) => id !== zoneId)
        : [...previous.filter((id) => !zone?.excludes.includes(id)), zoneId],
    );
    setDate(null);
    setSlot(null);
  };

  if (cars.isPending || catalog.isPending) return <Skeleton />;
  if (cars.data && cars.data.items.length === 0) {
    return (
      <PhoneGate>
        <section className="screen">
          <ScreenHeader title={t.booking.titleServices} onBack={onExit} />
          <EmptyState
            icon={<Plus size={28} />}
            title={t.booking.noCars}
            action={<Button onClick={onAddCar}>{t.home.addCar}</Button>}
          />
        </section>
      </PhoneGate>
    );
  }
  if (!car || !type) return <Notice tone="danger">{t.errors.generic}</Notice>;

  const stepNumber = step === 'services' ? 1 : step === 'time' ? 2 : 3;
  const titles = {
    services: t.booking.titleServices,
    time: t.booking.titleTime,
    confirm: t.booking.titleConfirm,
  };

  const summary = quote.data ? (
    <>
      <span className="num-xl">{formatMoney(quote.data.subtotal, lang)}</span>
      <span className="secondary">
        {t.booking.duration}: {formatDuration(quote.data.totalMinutes, lang)}
        {quote.data.unpricedCount > 0 && ` · ${t.booking.agreedNote(quote.data.unpricedCount)}`}
      </span>
    </>
  ) : null;

  return (
    <PhoneGate>
      <section className="screen screen--with-bar">
        <ScreenHeader
          title={titles[step]}
          onBack={back}
          aside={<span className="caption">{t.booking.step(stepNumber, TOTAL_STEPS)}</span>}
        />
        <div className="progress" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <span key={n} className={n <= stepNumber ? 'progress__bit is-done' : 'progress__bit'} />
          ))}
        </div>

        {step === 'services' && (
          <>
            {cars.data && cars.data.items.length > 1 && (
              <div className="chips">
                {cars.data.items.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    className={candidate.id === car.id ? 'chip-choice is-selected' : 'chip-choice'}
                    onClick={() => {
                      setCarId(candidate.id);
                      setSelected([]);
                    }}
                  >
                    {candidate.brand ? `${candidate.brand} ${candidate.model}` : candidate.model}
                  </button>
                ))}
              </div>
            )}
            <div className="card booking-car">
              <span>{car.brand ? `${car.brand} ${car.model}` : car.model}</span>
              <PlateChip plate={car.plate} />
            </div>
            <p className="secondary">
              {t.car.classLine(car.bodyClass)}. {t.booking.zonesHint}
            </p>

            <div className="chips">
              {types.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  className={candidate.id === type.id ? 'chip-choice is-selected' : 'chip-choice'}
                  onClick={() => setTypeId(candidate.id)}
                >
                  {pick(lang, { uz: candidate.nameUz, ru: candidate.nameRu })}
                </button>
              ))}
            </div>

            <ul className="list">
              {type.zones.map((zone) => {
                const cell = zone.prices.find((price) => price.bodyClass === car.bodyClass);
                const isOn = selected.includes(zone.id);
                const disabled = !cell || (!isOn && blocked(zone.id));
                return (
                  <li key={zone.id}>
                    <button
                      type="button"
                      className={isOn ? 'zone-row is-selected' : 'zone-row'}
                      disabled={disabled}
                      aria-pressed={isOn}
                      onClick={() => toggle(zone.id)}
                    >
                      <span className="zone-row__check" aria-hidden="true">
                        {isOn && <Check size={16} />}
                      </span>
                      <span className="zone-row__text">
                        <span>{pick(lang, { uz: zone.nameUz, ru: zone.nameRu })}</span>
                        <span className="secondary">
                          {cell ? formatDuration(cell.durationMin, lang) : t.booking.notOffered}
                        </span>
                      </span>
                      <span className="num zone-row__price">
                        {cell
                          ? cell.price === null
                            ? t.common.agreed
                            : formatMoney(cell.price, lang)
                          : ''}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {step === 'time' && (
          <>
            {availability.data?.multiDay && <Notice tone="info">{t.booking.multiDay}</Notice>}
            <h2 className="title">{t.booking.pickDay}</h2>
            {availability.isPending && <Skeleton rows={1} />}
            {availability.isError && (
              <Notice tone="danger">{errorText(t, availability.error)}</Notice>
            )}
            <div className="day-strip">
              {availability.data?.days.map((day) => {
                const off = day.state !== 'free';
                return (
                  <button
                    key={day.date}
                    type="button"
                    disabled={off}
                    className={day.date === date ? 'day is-selected' : 'day'}
                    onClick={() => {
                      setDate(day.date);
                      setSlot(null);
                    }}
                  >
                    <span className="caption">{weekdayShort(weekdayOfDate(day.date), lang)}</span>
                    <span className="num">{Number(day.date.slice(8))}</span>
                    <span className="caption day__note">
                      {day.state === 'full'
                        ? t.booking.full
                        : day.closedReason === 'holiday'
                          ? t.booking.holiday
                          : day.closedReason === 'day_off'
                            ? t.booking.dayOff
                            : ''}
                    </span>
                  </button>
                );
              })}
            </div>

            {date && (
              <>
                <h2 className="title">{t.booking.pickTime}</h2>
                {slots.isPending && <Skeleton rows={1} />}
                {slots.isError && <Notice tone="danger">{errorText(t, slots.error)}</Notice>}
                <div className="slot-grid">
                  {slots.data?.slots.map((candidate) => (
                    <button
                      key={candidate.startsAt.at}
                      type="button"
                      disabled={!candidate.free}
                      className={
                        candidate.startsAt.at === slot?.startsAt.at ? 'slot is-selected' : 'slot'
                      }
                      onClick={() => setSlot(candidate)}
                    >
                      <span className="num">{candidate.startsAt.time}</span>
                    </button>
                  ))}
                </div>
                {slots.data && slots.data.nearest.length > 0 && (
                  <>
                    <p className="secondary">{t.booking.noFree}</p>
                    <div className="slot-grid">
                      {slots.data.nearest.map((candidate) => (
                        <button
                          key={candidate.startsAt.at}
                          type="button"
                          className="slot"
                          onClick={() => {
                            setDate(candidate.startsAt.date);
                            setSlot(candidate);
                          }}
                        >
                          <span className="caption">
                            {formatDateLong(candidate.startsAt.date, lang)}
                          </span>
                          <span className="num">{candidate.startsAt.time}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        {step === 'confirm' && quote.data && slot && (
          <>
            {send.isError && <Notice tone="danger">{errorText(t, send.error)}</Notice>}
            <div className="card summary">
              <div className="summary__row">
                <span className="secondary">{t.booking.car}</span>
                <span>
                  {car.brand ? `${car.brand} ${car.model}` : car.model}
                  <PlateChip plate={car.plate} />
                </span>
              </div>
              <div className="summary__row">
                <span className="secondary">{t.booking.summaryTime}</span>
                <span>
                  {formatDateLong(slot.startsAt.date, lang)}, {slot.startsAt.time}
                </span>
              </div>
              <ul className="summary__items">
                {quote.data.items.map((item) => (
                  <li key={item.serviceId}>
                    <span>
                      {pick(lang, { uz: item.typeNameUz, ru: item.typeNameRu })}:{' '}
                      {pick(lang, { uz: item.nameUz, ru: item.nameRu })}
                    </span>
                    <span className="num">
                      {item.price === null ? t.common.agreed : formatMoney(item.price, lang)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="summary__row">
                <span>{t.booking.total}</span>
                <span className="num-xl">{formatMoney(quote.data.subtotal, lang)}</span>
              </div>
              <p className="secondary">
                {t.booking.readyAt(
                  `${formatDateLong(slot.endsAt.date, lang)}, ${slot.endsAt.time}`,
                )}
              </p>
            </div>
            <label className="field">
              <span className="field__label">{t.booking.comment}</span>
              <textarea
                className="field__input"
                rows={3}
                maxLength={300}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
            </label>
            <Notice tone="info">{t.booking.holdNote}</Notice>
          </>
        )}

        <BottomBar summary={step === 'services' ? summary : undefined}>
          {step === 'services' && (
            <Button disabled={selected.length === 0 || !quote.data} onClick={() => setStep('time')}>
              {selected.length === 0 ? t.booking.chooseZones : t.booking.next}
            </Button>
          )}
          {step === 'time' && (
            <Button disabled={!slot} onClick={() => setStep('confirm')}>
              {t.booking.next}
            </Button>
          )}
          {step === 'confirm' && (
            <Button busy={send.isPending} onClick={() => send.mutate()}>
              {t.booking.send}
            </Button>
          )}
        </BottomBar>
      </section>
    </PhoneGate>
  );
}
