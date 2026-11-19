import type { AdminAct, Checklist } from '@cs/shared';
import { formatDateLong } from '@cs/shared/format';
import {
  CHECKLIST_ITEMS,
  DEFECT_KINDS,
  DEFECT_VIEWS,
  PHOTO_SIDES,
  type DefectKind,
  type DefectView,
  type PhotoSide,
} from '@cs/shared/vocabulary';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { call } from '../../api';
import { useCan } from '../../auth/session';
import { useLang, useT } from '../../i18n';
import { apiMessage, genericMessage } from '../../lib/errors';
import { ORDERS_KEY, SCHEDULE_KEY, TODAY_KEY, actKey, orderKey } from '../../lib/keys';
import { newPhotoId } from '../../lib/photo';
import { BodySchema } from '../../ui/BodySchema';
import { Button } from '../../ui/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { Field } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { PhotoTile } from '../../ui/PhotoTile';
import { PhotoStrip } from '../../ui/PhotoViewer';
import { SelectField } from '../../ui/SelectField';
import './reception.css';

type Step = 'figures' | 'body' | 'photos' | 'confirm';
const STEPS: readonly Step[] = ['figures', 'body', 'photos', 'confirm'];

/** A defect as it is being marked: the photo is uploaded at once, the rest is saved with the act. */
interface DefectDraft {
  key: string;
  view: DefectView;
  x: number;
  y: number;
  kind: DefectKind;
  note: string;
  photo: { mediaId: string; url: string } | null;
}

interface Form {
  mileage: string;
  fuel: number | null;
  checklist: Checklist;
  personal: string;
  defects: DefectDraft[];
}

const formOf = (act: AdminAct['act']): Form => ({
  mileage: act?.mileageKm === null || act?.mileageKm === undefined ? '' : String(act.mileageKm),
  fuel: act?.fuelLevel ?? null,
  checklist: act?.checklist ?? {},
  personal: act?.personalItems ?? '',
  defects: (act?.defects ?? []).map((defect) => ({
    key: defect.id,
    view: defect.view,
    x: defect.x,
    y: defect.y,
    kind: defect.kind,
    note: defect.note ?? '',
    photo: defect.photo,
  })),
});

/** The reception act (design A2): figures, defects on the car, photos, and the client's word. */
export function ReceptionPage() {
  const t = useT();
  const { id = '' } = useParams();
  const order = useQuery({
    queryKey: orderKey(id),
    queryFn: () => call('admin.order', { params: { id } }),
  });
  const act = useQuery({
    queryKey: actKey(id),
    queryFn: () => call('admin.act', { params: { id } }),
  });

  return (
    <section className="reception">
      <Link className="back-link" to={`/orders/${id}`}>
        <ArrowLeft size={16} aria-hidden="true" />
        {t.reception.back(order.data?.number ?? 0)}
      </Link>
      {act.isError && <Notice tone="danger">{genericMessage(act.error, t)}</Notice>}
      {/* The form starts from the act as loaded; photos refresh the page's data, never the form. */}
      {act.data && order.data && <ActForm key={id} orderId={id} loaded={act.data} />}
    </section>
  );
}

function ActForm({ orderId, loaded }: { orderId: string; loaded: AdminAct }) {
  const t = useT();
  const lang = useLang();
  const can = useCan();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('figures');
  const [form, setForm] = useState<Form>(() => formOf(loaded.act));
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState<DefectView>('top');
  const [selected, setSelected] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const state = loaded;
  const act = state.act;
  const writable = can('reception.write') && state.canEdit;
  const edit = (patch: Partial<Form>) => {
    setForm((previous) => ({ ...previous, ...patch }));
    setDirty(true);
    setSaved(false);
  };

  const refresh = async (next?: AdminAct) => {
    if (next) queryClient.setQueryData(actKey(orderId), next);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: actKey(orderId) }),
      queryClient.invalidateQueries({ queryKey: orderKey(orderId) }),
      queryClient.invalidateQueries({ queryKey: ORDERS_KEY }),
      queryClient.invalidateQueries({ queryKey: TODAY_KEY }),
      queryClient.invalidateQueries({ queryKey: SCHEDULE_KEY }),
    ]);
  };

  const save = useMutation({
    mutationFn: () =>
      call('admin.saveAct', {
        params: { id: orderId },
        body: {
          mileageKm: /^\d+$/.test(form.mileage.trim()) ? Number(form.mileage.trim()) : null,
          fuelLevel: form.fuel,
          checklist: form.checklist,
          personalItems: form.personal.trim() || null,
          defects: form.defects.map((defect) => ({
            view: defect.view,
            x: defect.x,
            y: defect.y,
            kind: defect.kind,
            note: defect.note.trim() || null,
            mediaId: defect.photo?.mediaId ?? null,
          })),
        },
      }),
    onSuccess: async (next) => {
      setDirty(false);
      setSaved(true);
      setError(null);
      await refresh(next);
    },
    onError: setError,
  });
  const send = useMutation({
    mutationFn: () => call('admin.sendAct', { params: { id: orderId } }),
    onSuccess: async (next) => {
      setError(null);
      await refresh(next);
    },
    onError: setError,
  });
  const [confirmingVerbal, setConfirmingVerbal] = useState(false);
  const verbal = useMutation({
    mutationFn: () => call('admin.confirmActVerbal', { params: { id: orderId } }),
    onSuccess: async (next) => {
      setError(null);
      setConfirmingVerbal(false);
      await refresh(next);
    },
  });
  const start = useMutation({
    mutationFn: () => call('admin.startWork', { params: { id: orderId } }),
    onSuccess: async () => {
      await refresh();
      void navigate(`/orders/${orderId}`);
    },
    onError: setError,
  });

  /** Uploads a photo at once (it reopens a sent act, so the page's data is refreshed after). */
  async function upload(
    key: string,
    query: { purpose: 'side'; side: PhotoSide } | { purpose: 'defect' },
    bytes: Uint8Array,
  ) {
    setBusy(key);
    try {
      const photo = await call('admin.putActPhoto', {
        params: { id: orderId, mediaId: newPhotoId() },
        query,
        body: bytes,
      });
      setError(null);
      await refresh();
      return photo;
    } catch (failure) {
      setError(failure);
      return null;
    } finally {
      setBusy(null);
    }
  }

  const markers = form.defects.map((defect, index) => ({ ...defect, number: index + 1 }));
  const addDefect = (point: { x: number; y: number }) => {
    edit({
      defects: [
        ...form.defects,
        { key: newPhotoId(), view, ...point, kind: 'scratch', note: '', photo: null },
      ],
    });
    setSelected(form.defects.length + 1);
  };
  const patchDefect = (index: number, patch: Partial<DefectDraft>) =>
    edit({ defects: form.defects.map((d, i) => (i === index ? { ...d, ...patch } : d)) });

  const missing = act?.missing ?? ['mileage', 'fuel', ...PHOTO_SIDES];
  const sideUrl = (side: PhotoSide) => act?.sides.find((photo) => photo.side === side) ?? null;
  const when = (instant: { date: string; time: string } | null | undefined) =>
    instant ? `${formatDateLong(instant.date, lang)}, ${instant.time}` : '';

  return (
    <>
      <header className="reception__head">
        <h1 className="page-title">{t.reception.title}</h1>
        {act && (
          <span className={`chip act-chip act-chip--${act.status}`}>{t.actStatus[act.status]}</span>
        )}
      </header>

      {!writable && <Notice tone="info">{t.reception.readOnly}</Notice>}
      {writable && act?.status === 'sent' && (
        <Notice tone="warning">{t.reception.changedNote}</Notice>
      )}

      <nav className="steps" aria-label={t.reception.title}>
        {STEPS.map((name) => (
          <button
            key={name}
            type="button"
            className={step === name ? 'steps__chip is-active' : 'steps__chip'}
            onClick={() => setStep(name)}
          >
            {t.reception.steps[name]}
          </button>
        ))}
      </nav>

      {step === 'figures' && (
        <section className="card reception__panel">
          <div className="form-row">
            <Field
              label={t.reception.mileage}
              inputMode="numeric"
              value={form.mileage}
              disabled={!writable}
              maxLength={7}
              onChange={(event) => edit({ mileage: event.target.value.replace(/\D/g, '') })}
            />
            <div className="field">
              <span className="field__label">{t.reception.fuelTitle}</span>
              <div className="fuel" role="group" aria-label={t.reception.fuelTitle}>
                {t.reception.fuelLevels.map((label, level) => (
                  <button
                    key={label}
                    type="button"
                    disabled={!writable}
                    aria-pressed={form.fuel === level}
                    className={form.fuel === level ? 'fuel__level is-active' : 'fuel__level'}
                    onClick={() => edit({ fuel: level })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <fieldset className="checks">
            <legend className="field__label">{t.reception.checklist}</legend>
            {CHECKLIST_ITEMS.map((item) => (
              <label key={item} className="check">
                <input
                  type="checkbox"
                  checked={form.checklist[item] === true}
                  disabled={!writable}
                  onChange={(event) =>
                    edit({ checklist: { ...form.checklist, [item]: event.target.checked } })
                  }
                />
                <span className="check__text">{t.reception.checklistItems[item]}</span>
              </label>
            ))}
          </fieldset>
          <Field
            label={t.reception.personalItems}
            hint={t.reception.personalHint}
            value={form.personal}
            maxLength={300}
            disabled={!writable}
            onChange={(event) => edit({ personal: event.target.value })}
          />
        </section>
      )}

      {step === 'body' && (
        <section className="card reception__panel">
          <div className="pills" role="tablist">
            {DEFECT_VIEWS.map((name) => (
              <button
                key={name}
                type="button"
                className={view === name ? 'pill is-active' : 'pill'}
                onClick={() => setView(name)}
              >
                {t.reception.views[name]}
              </button>
            ))}
          </div>
          <p className="muted">{writable ? t.reception.defectsHint : ''}</p>
          <div className="reception__body">
            <BodySchema
              view={view}
              markers={markers}
              selected={selected}
              {...(writable && { onAdd: addDefect })}
              onSelect={setSelected}
            />
            <ol className="defects">
              {form.defects.length === 0 && <li className="muted">{t.reception.noDefects}</li>}
              {form.defects.map((defect, index) => (
                <li
                  key={defect.key}
                  className={selected === index + 1 ? 'defects__row is-selected' : 'defects__row'}
                >
                  <button
                    type="button"
                    className={`defects__num body__mark--${defect.kind}`}
                    onClick={() => {
                      setSelected(index + 1);
                      setView(defect.view);
                    }}
                  >
                    {index + 1}
                  </button>
                  <div className="defects__fields">
                    <div className="defects__line">
                      <SelectField
                        label={t.reception.defect(index + 1)}
                        value={defect.kind}
                        disabled={!writable}
                        onChange={(event) =>
                          patchDefect(index, { kind: event.target.value as DefectKind })
                        }
                      >
                        {DEFECT_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {t.reception.kinds[kind]} · {t.reception.views[defect.view]}
                          </option>
                        ))}
                      </SelectField>
                      {writable && (
                        <Button
                          variant="ghost"
                          aria-label={t.reception.removeDefect}
                          icon={<Trash2 size={16} aria-hidden="true" />}
                          onClick={() => {
                            edit({ defects: form.defects.filter((_, i) => i !== index) });
                            setSelected(null);
                          }}
                        />
                      )}
                    </div>
                    <Field
                      label={t.reception.defectNote}
                      value={defect.note}
                      maxLength={300}
                      disabled={!writable}
                      onChange={(event) => patchDefect(index, { note: event.target.value })}
                    />
                    <PhotoTile
                      url={defect.photo?.url ?? null}
                      label={t.reception.defectPhoto}
                      busy={busy === defect.key}
                      disabled={!writable}
                      onPhoto={async (bytes) => {
                        const photo = await upload(defect.key, { purpose: 'defect' }, bytes);
                        if (photo) patchDefect(index, { photo });
                      }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {step === 'photos' && (
        <section className="card reception__panel">
          <p className="muted">{t.reception.photosHint}</p>
          <div className="reception__sides">
            {PHOTO_SIDES.map((side) => (
              <PhotoTile
                key={side}
                url={sideUrl(side)?.url ?? null}
                label={t.reception.sides[side]}
                busy={busy === side}
                disabled={!writable}
                onPhoto={async (bytes) => {
                  await upload(side, { purpose: 'side', side }, bytes);
                }}
              />
            ))}
          </div>
          {act && act.defects.some((defect) => defect.photo) && (
            <PhotoStrip
              photos={act.defects.flatMap((defect, index) =>
                defect.photo
                  ? [{ ...defect.photo, caption: `${t.reception.defect(index + 1)}` }]
                  : [],
              )}
              empty=""
            />
          )}
        </section>
      )}

      {step === 'confirm' && (
        <section className="card reception__panel">
          <h2 className="section-title">{t.reception.confirmTitle}</h2>
          {act?.status === 'confirmed' ? (
            <Notice tone="success">
              {t.reception.confirmedText(
                t.reception.via[act.confirmedVia ?? 'verbal'],
                when(act.confirmedAt),
              )}
            </Notice>
          ) : act?.status === 'sent' ? (
            <Notice tone="info">{t.reception.sentText(when(act.sentAt))}</Notice>
          ) : (
            <p className="muted">{t.reception.notSent}</p>
          )}
        </section>
      )}

      {error !== null && error !== undefined && (
        <Notice tone="danger">{apiMessage(error, t)}</Notice>
      )}
      {saved && !dirty && <Notice tone="success">{t.reception.saved}</Notice>}

      <div className="action-bar">
        <p className="action-bar__text">
          {act?.status === 'confirmed'
            ? ''
            : missing.length > 0
              ? t.reception.missingBar(missing.map((item) => t.reception.missing[item]).join(', '))
              : ''}
        </p>
        <div className="action-bar__buttons">
          {writable && (
            <Button
              variant="secondary"
              busy={save.isPending}
              disabled={!dirty}
              onClick={() => save.mutate()}
            >
              {t.reception.save}
            </Button>
          )}
          {writable && (
            <Button
              variant="secondary"
              disabled={dirty || !state.canConfirmVerbal}
              onClick={() => setConfirmingVerbal(true)}
            >
              {t.reception.verbal}
            </Button>
          )}
          {writable && (
            <Button
              busy={send.isPending}
              disabled={dirty || !state.canSend}
              onClick={() => send.mutate()}
            >
              {t.reception.send}
            </Button>
          )}
          {can('reception.write') && state.canStartWork && (
            <Button busy={start.isPending} onClick={() => start.mutate()}>
              {t.reception.startWork}
            </Button>
          )}
        </div>
      </div>
      {confirmingVerbal && (
        <ConfirmDialog
          title={t.confirm.verbalTitle}
          confirmLabel={t.confirm.verbalSubmit}
          pending={verbal.isPending}
          error={verbal.error}
          onConfirm={() => verbal.mutate()}
          onClose={() => {
            setConfirmingVerbal(false);
            verbal.reset();
          }}
        >
          <p>{t.confirm.verbalText}</p>
        </ConfirmDialog>
      )}
    </>
  );
}
