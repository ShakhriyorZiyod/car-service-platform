import type { ClientCard } from '@cs/shared';
import {
  formatDateLong,
  formatMoney,
  formatPhone,
  normalizePhone,
  phoneInputState,
} from '@cs/shared/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { call } from '../../api';
import { useCan } from '../../auth/session';
import { useLang, useT } from '../../i18n';
import { apiMessage, invalidFields } from '../../lib/errors';
import { CATALOG_KEY, CLIENTS_KEY, UNMAPPED_CARS_KEY, clientKey } from '../../lib/keys';
import { Button } from '../../ui/Button';
import { CarForm, type CarValues } from '../../ui/CarForm';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { PhoneField, phoneFieldText } from '../../ui/PhoneField';
import { PlateChip } from '../../ui/PlateChip';
import { StatusChip } from '../../ui/StatusChip';
import './clients.css';

/** A client's card (design A10): contact, the admin's note, cars and orders. */
export function ClientPage() {
  const t = useT();
  const { id = '' } = useParams();
  const card = useQuery({
    queryKey: clientKey(id),
    queryFn: () => call('admin.client', { params: { id } }),
  });
  return (
    <section className="client">
      <Link className="back-link" to="/clients">
        <ArrowLeft size={16} aria-hidden="true" />
        {t.clients.back}
      </Link>
      {card.isError && <Notice tone="danger">{apiMessage(card.error, t)}</Notice>}
      {card.data && <CardView key={card.data.id} card={card.data} />}
    </section>
  );
}

function CardView({ card }: { card: ClientCard }) {
  const t = useT();
  const lang = useLang();
  const can = useCan();
  const queryClient = useQueryClient();
  const [addingCar, setAddingCar] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [fullName, setFullName] = useState(card.fullName);
  const [phone, setPhone] = useState(phoneFieldText(card.phone));
  const [note, setNote] = useState(card.internalNote ?? '');
  const canWrite = can('clients.write') && !card.isAnonymized;

  const refresh = async (updated?: ClientCard) => {
    if (updated) queryClient.setQueryData(clientKey(card.id), updated);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: clientKey(card.id) }),
      queryClient.invalidateQueries({ queryKey: CLIENTS_KEY }),
      queryClient.invalidateQueries({ queryKey: UNMAPPED_CARS_KEY }),
    ]);
  };

  const save = useMutation({
    mutationFn: (body: { fullName?: string; phone?: string; internalNote?: string | null }) =>
      call('admin.updateClient', { params: { id: card.id }, body }),
    onSuccess: (updated) => refresh(updated),
  });
  const invalid = invalidFields(save.error);
  // An emptied field is no change: a client's number is not removed here, only replaced.
  const phoneState = card.phoneVerified ? 'empty' : phoneInputState(phone);
  const phoneChanged = phoneState === 'complete' && normalizePhone(phone) !== card.phone;
  const contactChanged =
    (fullName.trim() !== card.fullName || phoneChanged) && phoneState !== 'incomplete';
  const noteChanged = note.trim() !== (card.internalNote ?? '');

  const erase = useMutation({
    mutationFn: () => call('admin.anonymizeClient', { params: { id: card.id } }),
    onSuccess: async (updated) => {
      setErasing(false);
      await refresh(updated);
    },
  });

  return (
    <>
      <header className="client__head">
        <h1 className="page-title">{card.fullName}</h1>
        {card.isAnonymized && <span className="chip">{t.clients.anonymized}</span>}
        <div className="client__head-actions">
          {canWrite && (
            <Link className="btn btn--primary" to={`/orders/new?client=${card.id}`}>
              <Plus size={16} aria-hidden="true" />
              {t.clients.card.newOrder}
            </Link>
          )}
          {can('clients.anonymize') && !card.isAnonymized && (
            <Button variant="secondary" className="btn--danger" onClick={() => setErasing(true)}>
              {t.clients.anonymize.button}
            </Button>
          )}
        </div>
      </header>

      {card.deletionRequested && !card.isAnonymized && (
        <Notice tone="warning">{t.clients.card.deletionBanner}</Notice>
      )}

      <div className="client__grid">
        <div className="client__main">
          <section className="card client__panel">
            <h2 className="section-title">{t.clients.card.contact}</h2>
            <form
              className="form-stack"
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate({
                  ...(fullName.trim() !== card.fullName && { fullName: fullName.trim() }),
                  ...(phoneChanged && { phone }),
                });
              }}
            >
              <div className="form-row">
                <Field
                  label={t.clients.card.editName}
                  value={fullName}
                  maxLength={80}
                  disabled={!canWrite}
                  error={invalid.has('fullName') ? t.errors.validation : null}
                  onChange={(event) => setFullName(event.target.value)}
                />
                <PhoneField
                  label={t.clients.card.editPhone}
                  value={card.phoneVerified && card.phone ? formatPhone(card.phone) : phone}
                  disabled={!canWrite || card.phoneVerified}
                  hint={card.phoneVerified ? t.clients.card.phoneLocked : undefined}
                  error={invalid.has('phone') ? t.errors.validation : null}
                  onChange={setPhone}
                />
              </div>
              <p className="client__chips">
                <span className={card.phoneVerified ? 'chip' : 'chip chip--warning'}>
                  {card.phoneVerified
                    ? t.clients.card.phoneVerified
                    : t.clients.card.phoneUnverified}
                </span>
                <span className="chip">
                  {card.hasTelegram ? t.clients.card.telegram : t.clients.card.noTelegram}
                </span>
                {card.telegramId !== null && (
                  <span className="chip num">{t.clients.card.telegramId(card.telegramId)}</span>
                )}
              </p>
              {save.isError && <Notice tone="danger">{apiMessage(save.error, t)}</Notice>}
              {canWrite && (
                <div>
                  <Button type="submit" busy={save.isPending} disabled={!contactChanged}>
                    {t.clients.card.save}
                  </Button>
                </div>
              )}
            </form>
          </section>

          <section className="card client__panel">
            <h2 className="section-title">{t.clients.card.orders}</h2>
            {card.orders.length === 0 ? (
              <p className="muted">{t.clients.card.noOrders}</p>
            ) : (
              <table className="table">
                <tbody>
                  {card.orders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <Link className="table__link num" to={`/orders/${order.id}`}>
                          №{order.number}
                        </Link>
                      </td>
                      <td className="muted">{formatDateLong(order.startsAt.date, lang)}</td>
                      <td>
                        {order.car.label} <PlateChip plate={order.car.plate} />
                      </td>
                      <td>
                        <StatusChip status={order.status} />
                      </td>
                      <td className="table__num num">{formatMoney(order.total, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <aside className="client__side">
          <section className="card client__panel">
            <div className="client__row">
              <h2 className="section-title">{t.clients.card.cars}</h2>
              {canWrite && (
                <Button variant="ghost" onClick={() => setAddingCar(true)}>
                  {t.clients.card.addCar}
                </Button>
              )}
            </div>
            {card.cars.length === 0 && <p className="muted">{t.clients.card.noCars}</p>}
            <ul className="client__cars">
              {card.cars.map((car) => (
                <li key={car.id}>
                  <span>
                    {car.brand ? `${car.brand} ${car.model}` : car.model}
                    <span className="muted"> · {car.year}</span>
                  </span>
                  <PlateChip plate={car.plate} />
                </li>
              ))}
            </ul>
          </section>

          <section className="card client__panel">
            <h2 className="section-title">{t.clients.card.note}</h2>
            <div className="field">
              <textarea
                className="field__input field__input--area"
                rows={4}
                maxLength={1000}
                aria-label={t.clients.card.note}
                disabled={!canWrite}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <span className="field__hint">{t.clients.card.noteHint}</span>
            </div>
            {canWrite && (
              <div>
                <Button
                  variant="secondary"
                  busy={save.isPending}
                  disabled={!noteChanged}
                  onClick={() => save.mutate({ internalNote: note.trim() || null })}
                >
                  {t.clients.card.noteSave}
                </Button>
              </div>
            )}
          </section>
        </aside>
      </div>

      {addingCar && (
        <AddCarDialog clientId={card.id} onClose={() => setAddingCar(false)} onDone={refresh} />
      )}
      {erasing && (
        <Dialog title={t.clients.anonymize.title} onClose={() => setErasing(false)}>
          <div className="form-stack">
            <p>{t.clients.anonymize.text}</p>
            {erase.isError && <Notice tone="danger">{apiMessage(erase.error, t)}</Notice>}
            <div className="dialog__actions">
              <Button variant="secondary" onClick={() => setErasing(false)}>
                {t.form.cancel}
              </Button>
              <Button busy={erase.isPending} onClick={() => erase.mutate()}>
                {t.clients.anonymize.submit}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}

function AddCarDialog({
  clientId,
  onClose,
  onDone,
}: {
  clientId: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const t = useT();
  const catalog = useQuery({
    queryKey: CATALOG_KEY,
    queryFn: () => call('admin.catalog'),
    staleTime: 5 * 60_000,
  });
  const add = useMutation({
    mutationFn: (values: CarValues) =>
      call('admin.createClientCar', { params: { id: clientId }, body: values }),
    onSuccess: async () => {
      await onDone();
      onClose();
    },
  });
  return (
    <Dialog title={t.clients.card.addCar} onClose={onClose}>
      {catalog.data && (
        <CarForm
          catalog={catalog.data}
          pending={add.isPending}
          error={add.error}
          onSubmit={(values) => add.mutate(values)}
        />
      )}
    </Dialog>
  );
}
