import type { Car, ClientCard, Slot } from '@cs/shared';
import { formatPhone } from '@cs/shared/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ApiRequestError, call } from '../../api';
import { useT } from '../../i18n';
import { apiMessage, genericMessage, invalidFields } from '../../lib/errors';
import {
  CATALOG_KEY,
  CLIENTS_KEY,
  ORDERS_KEY,
  SCHEDULE_KEY,
  TODAY_KEY,
  clientKey,
} from '../../lib/keys';
import { Button } from '../../ui/Button';
import { CarForm, type CarValues } from '../../ui/CarForm';
import { Field } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { PlateChip } from '../../ui/PlateChip';
import { SelectField } from '../../ui/SelectField';
import { SlotPicker } from '../../ui/SlotPicker';
import { ZonePicker } from '../../ui/ZonePicker';
import './new-order.css';

const SOURCES = ['phone', 'walk_in', 'instagram', 'other'] as const;
type Source = (typeof SOURCES)[number];

/** The part of a client the form needs to go on. */
interface Chosen {
  id: string;
  fullName: string;
  phone: string | null;
  hasTelegram: boolean;
}

/**
 * A new order entered by hand (design A7): client, car, zones, time, where it came from and
 * whether the client already confirmed it by phone. The server applies the same rules as for a
 * client in the Mini App.
 */
export function NewOrderPage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();

  // undefined: nobody picked yet, so the client the card sent us from (if any) counts.
  const [picked, setPicked] = useState<Chosen | null | undefined>(undefined);
  const [car, setCar] = useState<Car | null>(null);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [source, setSource] = useState<Source>('phone');
  const [comment, setComment] = useState('');
  const [confirmedByClient, setConfirmedByClient] = useState(true);

  // Coming from a client's card: that client is chosen already.
  const presetId = params.get('client');
  const preset = useQuery({
    queryKey: clientKey(presetId ?? ''),
    queryFn: () => call('admin.client', { params: { id: presetId ?? '' } }),
    enabled: presetId !== null && picked === undefined,
  });
  const client = picked === undefined && preset.data ? toChosen(preset.data) : (picked ?? null);

  const catalog = useQuery({
    queryKey: CATALOG_KEY,
    queryFn: () => call('admin.catalog'),
    staleTime: 5 * 60_000,
  });

  const choose = (next: Chosen | null) => {
    setPicked(next);
    setCar(null);
    setServiceIds([]);
    setSlot(null);
  };

  const create = useMutation({
    mutationFn: () => {
      if (!client || !car || !slot) throw new Error('incomplete');
      return call('admin.createOrder', {
        body: {
          clientId: client.id,
          carId: car.id,
          serviceIds,
          startsAt: slot.startsAt.at,
          source,
          confirmedByClient,
          ...(comment.trim() && { comment: comment.trim() }),
        },
      });
    },
    onSuccess: async (order) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ORDERS_KEY }),
        queryClient.invalidateQueries({ queryKey: TODAY_KEY }),
        queryClient.invalidateQueries({ queryKey: SCHEDULE_KEY }),
      ]);
      void navigate(`/orders/${order.id}`);
    },
    onError: (error) => {
      // Somebody took the time: show what is free now.
      if (error instanceof ApiRequestError && error.code === 'slot_taken') setSlot(null);
      void queryClient.invalidateQueries({ queryKey: ['slots'] });
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
  });

  const ready = client !== null && car !== null && serviceIds.length > 0 && slot !== null;
  return (
    <section className="new-order">
      <Link className="back-link" to="/orders">
        <ArrowLeft size={16} aria-hidden="true" />
        {t.newOrder.back}
      </Link>
      <h1 className="page-title">{t.newOrder.title}</h1>

      <Step title={t.newOrder.steps.client}>
        {client ? (
          <div className="chosen">
            <div>
              <strong>{client.fullName}</strong>
              {client.phone && <span className="muted"> · {formatPhone(client.phone)}</span>}
              {!client.hasTelegram && (
                <p className="muted chosen__note">{t.newOrder.noPhoneNote}</p>
              )}
            </div>
            <Button variant="ghost" onClick={() => choose(null)}>
              {t.newOrder.change}
            </Button>
          </div>
        ) : (
          <ClientStep onChosen={choose} />
        )}
      </Step>

      {client && (
        <Step title={t.newOrder.steps.car}>
          <CarStep
            clientId={client.id}
            chosen={car}
            onChosen={(next) => {
              setCar(next);
              setServiceIds([]);
              setSlot(null);
            }}
          />
        </Step>
      )}

      {car && (
        <Step title={t.newOrder.steps.items}>
          {catalog.isError && <Notice tone="danger">{genericMessage(catalog.error, t)}</Notice>}
          {catalog.data && (
            <ZonePicker
              catalog={catalog.data}
              bodyClass={car.bodyClass}
              selected={serviceIds}
              onChange={(ids) => {
                setServiceIds(ids);
                setSlot(null);
              }}
            />
          )}
        </Step>
      )}

      {car && serviceIds.length > 0 && (
        <Step title={t.newOrder.steps.time}>
          <SlotPicker
            bodyClass={car.bodyClass}
            serviceIds={serviceIds}
            value={slot}
            onChange={(next) => {
              setSlot(next);
              create.reset();
            }}
          />
        </Step>
      )}

      {ready && (
        <Step title={t.newOrder.steps.confirm}>
          <div className="form-stack">
            <div className="form-row">
              <SelectField
                label={t.newOrder.source}
                value={source}
                onChange={(event) => setSource(event.target.value as Source)}
              >
                {SOURCES.map((value) => (
                  <option key={value} value={value}>
                    {t.source[value]}
                  </option>
                ))}
              </SelectField>
              <Field
                label={t.newOrder.comment}
                value={comment}
                maxLength={500}
                onChange={(event) => setComment(event.target.value)}
              />
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={confirmedByClient}
                onChange={(event) => setConfirmedByClient(event.target.checked)}
              />
              <span className="check__text">
                <span>{t.newOrder.confirmedByClient}</span>
                <span className="muted">{t.newOrder.confirmedHint}</span>
              </span>
            </label>
            {create.isError && <Notice tone="danger">{apiMessage(create.error, t)}</Notice>}
            <div className="dialog__actions">
              <Button busy={create.isPending} onClick={() => create.mutate()}>
                {t.newOrder.submit}
              </Button>
            </div>
          </div>
        </Step>
      )}
    </section>
  );
}

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card step">
      <h2 className="section-title">{title}</h2>
      {children}
    </section>
  );
}

const toChosen = (card: Pick<ClientCard, 'id' | 'fullName' | 'phone' | 'hasTelegram'>): Chosen => ({
  id: card.id,
  fullName: card.fullName,
  phone: card.phone,
  hasTelegram: card.hasTelegram,
});

/** Finds an existing client, or enters a new one. */
function ClientStep({ onChosen }: { onChosen: (client: Chosen) => void }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [creating, setCreating] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const found = useQuery({
    queryKey: [...CLIENTS_KEY, 'find', debounced],
    queryFn: () => call('admin.clients', { query: { q: debounced, filter: 'all', limit: 8 } }),
    enabled: debounced !== '' && !creating,
  });

  const create = useMutation({
    mutationFn: () => call('admin.createClient', { body: { fullName, phone } }),
    onSuccess: async (card) => {
      await queryClient.invalidateQueries({ queryKey: CLIENTS_KEY });
      onChosen(toChosen(card));
    },
  });
  const invalid = invalidFields(create.error);

  if (creating) {
    return (
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <div className="form-row">
          <Field
            label={t.newOrder.clientName}
            value={fullName}
            maxLength={80}
            error={invalid.has('fullName') ? t.errors.validation : null}
            onChange={(event) => setFullName(event.target.value)}
          />
          <Field
            label={t.newOrder.clientPhone}
            inputMode="tel"
            value={phone}
            maxLength={32}
            error={invalid.has('phone') ? t.errors.validation : null}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>
        {create.isError && <Notice tone="danger">{apiMessage(create.error, t)}</Notice>}
        <div className="dialog__actions">
          <Button variant="secondary" onClick={() => setCreating(false)}>
            {t.form.cancel}
          </Button>
          <Button
            type="submit"
            busy={create.isPending}
            disabled={!fullName.trim() || !phone.trim()}
          >
            {t.newOrder.clientCreate}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="form-stack">
      <label className="topbar__search new-order__search">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          autoFocus
          placeholder={t.newOrder.findClient}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      {found.isError && <Notice tone="danger">{genericMessage(found.error, t)}</Notice>}
      {found.data && found.data.items.length === 0 && (
        <p className="muted">{t.newOrder.noClientFound}</p>
      )}
      <ul className="picklist">
        {found.data?.items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="picklist__row"
              onClick={() => onChosen(toChosen(item))}
            >
              <strong>{item.fullName}</strong>
              <span className="muted">{item.phone ? formatPhone(item.phone) : t.common.none}</span>
            </button>
          </li>
        ))}
      </ul>
      <div>
        <Button variant="secondary" onClick={() => setCreating(true)}>
          {t.newOrder.createClient}
        </Button>
      </div>
    </div>
  );
}

/** One of the client's cars, or a new one. */
function CarStep({
  clientId,
  chosen,
  onChosen,
}: {
  clientId: string;
  chosen: Car | null;
  onChosen: (car: Car) => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const card = useQuery({
    queryKey: clientKey(clientId),
    queryFn: () => call('admin.client', { params: { id: clientId } }),
  });
  const catalog = useQuery({
    queryKey: CATALOG_KEY,
    queryFn: () => call('admin.catalog'),
    staleTime: 5 * 60_000,
  });
  const add = useMutation({
    mutationFn: (values: CarValues) =>
      call('admin.createClientCar', { params: { id: clientId }, body: values }),
    onSuccess: async (car) => {
      await queryClient.invalidateQueries({ queryKey: clientKey(clientId) });
      setAdding(false);
      onChosen(car);
    },
  });

  const cars = card.data?.cars ?? [];
  if (card.isError) return <Notice tone="danger">{genericMessage(card.error, t)}</Notice>;
  if (adding && catalog.data) {
    return (
      <div className="form-stack">
        <CarForm
          catalog={catalog.data}
          pending={add.isPending}
          error={add.error}
          onSubmit={(values) => add.mutate(values)}
        />
        <div>
          <Button variant="ghost" onClick={() => setAdding(false)}>
            {t.form.cancel}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="form-stack">
      {card.isSuccess && cars.length === 0 && <p className="muted">{t.newOrder.carNone}</p>}
      <ul className="picklist">
        {cars.map((car) => (
          <li key={car.id}>
            <button
              type="button"
              aria-pressed={chosen?.id === car.id}
              className={chosen?.id === car.id ? 'picklist__row is-active' : 'picklist__row'}
              onClick={() => onChosen(car)}
            >
              <span>
                {car.brand ? `${car.brand} ${car.model}` : car.model} · {car.year}
              </span>
              <PlateChip plate={car.plate} />
            </button>
          </li>
        ))}
      </ul>
      <div>
        <Button variant="secondary" onClick={() => setAdding(true)}>
          {t.newOrder.addCar}
        </Button>
      </div>
    </div>
  );
}
