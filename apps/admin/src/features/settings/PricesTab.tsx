import type { PriceMatrix, Service, ServiceType } from '@cs/shared';
import { formatAmount, formatDuration } from '@cs/shared/format';
import {
  BODY_CLASSES,
  LIMITS,
  SERVICE_GROUPS,
  type BodyClass,
  type ServiceGroup,
} from '@cs/shared/vocabulary';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { call } from '../../api';
import { useLang, useT } from '../../i18n';
import { errorCodeOf, genericMessage, invalidFields } from '../../lib/errors';
import { BRANDS_KEY, SERVICE_TYPES_KEY } from '../../lib/keys';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { SelectField } from '../../ui/SelectField';
import { UnsavedBar } from '../../ui/UnsavedBar';

const pricesKey = (serviceTypeId: string) => ['prices', serviceTypeId] as const;

/** What is typed in one cell, as text: digits only, empty when nothing is entered. */
interface CellDraft {
  price: string;
  minutes: string;
}
/** Only the cells somebody has touched, by `serviceId:bodyClass`. */
type Edits = Record<string, CellDraft>;

const cellKey = (serviceId: string, bodyClass: BodyClass) => `${serviceId}:${bodyClass}`;

function savedCell(zone: Service, bodyClass: BodyClass): CellDraft {
  const cell = zone.cells.find((entry) => entry.bodyClass === bodyClass);
  return cell
    ? { price: cell.price === null ? '' : String(cell.price), minutes: String(cell.durationMin) }
    : { price: '', minutes: '' };
}

const digitsOf = (value: string, maxLength: number): string =>
  value
    .replace(/\D/g, '')
    .slice(0, maxLength)
    .replace(/^0+(?=\d)/, '');

/** "A12": the price list, one kind of work at a time (admin PDF, page 13; PLAN 7.5). */
export function PricesTab() {
  const t = useT();
  const lang = useLang();
  const types = useQuery({
    queryKey: SERVICE_TYPES_KEY,
    queryFn: () => call('admin.serviceTypes'),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [typeForm, setTypeForm] = useState<'new' | 'edit' | null>(null);
  // Unsaved prices wait here, per kind of work, while the owner looks at another one.
  const [editsByType, setEditsByType] = useState<Record<string, Edits>>({});

  const items = types.data?.items ?? [];
  const current =
    items.find((type) => type.id === selectedId) ?? items.find((type) => type.isActive) ?? items[0];
  const nameOf = (type: ServiceType) => (lang === 'ru' ? type.nameRu : type.nameUz);

  if (types.isPending) return <p className="muted">{t.form.loading}</p>;
  if (types.isError) return <Notice tone="danger">{genericMessage(types.error, t)}</Notice>;

  return (
    <div className="prices">
      <div className="prices__top">
        <div className="pills">
          {items.map((type) => (
            <button
              key={type.id}
              type="button"
              className={[
                'pill',
                type.id === current?.id && 'is-active',
                !type.isActive && 'is-hidden',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                setSelectedId(type.id);
                setTypeForm(null);
              }}
            >
              {nameOf(type)}
            </button>
          ))}
          <Button
            variant="ghost"
            icon={<Plus size={16} aria-hidden="true" />}
            onClick={() => setTypeForm('new')}
          >
            {t.prices.addType}
          </Button>
          {current && (
            <Button variant="ghost" onClick={() => setTypeForm('edit')}>
              {t.prices.editType}
            </Button>
          )}
        </div>
        <p className="muted prices__legend">{t.prices.legend}</p>
      </div>

      {typeForm && (
        <TypeEditor
          key={typeForm === 'new' ? 'new' : current?.id}
          type={typeForm === 'edit' ? (current ?? null) : null}
          onClose={() => setTypeForm(null)}
          onSaved={(type) => {
            setSelectedId(type.id);
            setTypeForm(null);
          }}
        />
      )}

      {current ? (
        <MatrixCard
          key={current.id}
          type={current}
          edits={editsByType[current.id] ?? {}}
          setEdits={(edits) => setEditsByType((previous) => ({ ...previous, [current.id]: edits }))}
        />
      ) : (
        <p className="muted">{t.prices.noTypes}</p>
      )}
    </div>
  );
}

function MatrixCard({
  type,
  edits,
  setEdits,
}: {
  type: ServiceType;
  edits: Edits;
  setEdits: (edits: Edits) => void;
}) {
  const t = useT();
  const lang = useLang();
  const queryClient = useQueryClient();
  const matrix = useQuery({
    queryKey: pricesKey(type.id),
    queryFn: () => call('admin.prices', { params: { serviceTypeId: type.id } }),
  });
  const brands = useQuery({ queryKey: BRANDS_KEY, queryFn: () => call('admin.brands') });
  // The zone being edited; `id: null` is a new zone, and no form at all is null.
  const [zoneForm, setZoneForm] = useState<{ id: string | null } | null>(null);

  // A few models of every class under its letter, so "M" means something to the owner.
  const examples = useMemo(() => {
    const models = (brands.data?.items ?? []).flatMap((brand) =>
      brand.isActive ? brand.models.filter((model) => model.isActive) : [],
    );
    return Object.fromEntries(
      BODY_CLASSES.map((bodyClass) => [
        bodyClass,
        models
          .filter((model) => model.bodyClass === bodyClass)
          .slice(0, 3)
          .map((model) => model.name)
          .join(', '),
      ]),
    ) as Record<BodyClass, string>;
  }, [brands.data]);

  const zones = matrix.data?.services ?? [];

  const draftOf = (zone: Service, bodyClass: BodyClass): CellDraft =>
    edits[cellKey(zone.id, bodyClass)] ?? savedCell(zone, bodyClass);
  const isChanged = (zone: Service, bodyClass: BodyClass): boolean => {
    const draft = edits[cellKey(zone.id, bodyClass)];
    const saved = savedCell(zone, bodyClass);
    return draft !== undefined && (draft.price !== saved.price || draft.minutes !== saved.minutes);
  };
  // A price needs the time it takes: without it the cell cannot be offered.
  const isIncomplete = (zone: Service, bodyClass: BodyClass): boolean => {
    const draft = draftOf(zone, bodyClass);
    return draft.price !== '' && draft.minutes === '';
  };

  const cells = zones.flatMap((zone) => BODY_CLASSES.map((bodyClass) => ({ zone, bodyClass })));
  const changes = cells.filter(({ zone, bodyClass }) => isChanged(zone, bodyClass)).length;
  const incomplete = cells.some(({ zone, bodyClass }) => isIncomplete(zone, bodyClass));

  const edit = (zone: Service, bodyClass: BodyClass, update: Partial<CellDraft>) =>
    setEdits({
      ...edits,
      [cellKey(zone.id, bodyClass)]: { ...draftOf(zone, bodyClass), ...update },
    });

  const save = useMutation({
    mutationFn: () =>
      call('admin.updatePrices', {
        params: { serviceTypeId: type.id },
        body: {
          cells: cells.flatMap(({ zone, bodyClass }) => {
            const draft = draftOf(zone, bodyClass);
            return draft.minutes === ''
              ? []
              : [
                  {
                    serviceId: zone.id,
                    bodyClass,
                    price: draft.price === '' ? null : Number(draft.price),
                    durationMin: Number(draft.minutes),
                  },
                ];
          }),
        },
      }),
    onSuccess: (result: PriceMatrix) => {
      queryClient.setQueryData(pricesKey(type.id), result);
      setEdits({});
    },
  });

  if (matrix.isPending) return <p className="muted">{t.form.loading}</p>;
  if (matrix.isError) return <Notice tone="danger">{genericMessage(matrix.error, t)}</Notice>;

  const editedZone = zoneForm?.id ? zones.find((zone) => zone.id === zoneForm.id) : null;

  return (
    <>
      {zoneForm && (
        <ZoneEditor
          key={zoneForm.id ?? 'new'}
          type={type}
          zone={editedZone ?? null}
          siblings={zones}
          onClose={() => setZoneForm(null)}
        />
      )}

      {save.error && <Notice tone="danger">{genericMessage(save.error, t)}</Notice>}

      <section className="card matrix">
        <table className="matrix__table">
          <thead>
            <tr>
              <th scope="col" className="matrix__zone-head">
                {t.prices.zone(lang === 'ru' ? type.nameRu : type.nameUz)}
              </th>
              {BODY_CLASSES.map((bodyClass) => (
                <th key={bodyClass} scope="col">
                  <span className="matrix__class num">{bodyClass}</span>
                  <span className="matrix__examples muted" title={examples[bodyClass]}>
                    {examples[bodyClass]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {zones.map((zone) => (
              <tr key={zone.id} className={zone.isActive ? undefined : 'is-hidden'}>
                <th scope="row" className="matrix__zone">
                  <button
                    type="button"
                    className="matrix__zone-name"
                    onClick={() => setZoneForm({ id: zone.id })}
                  >
                    {lang === 'ru' ? zone.nameRu : zone.nameUz}
                  </button>
                  {(!zone.isActive || zone.isCustom) && (
                    <span className="muted matrix__zone-note">
                      {[
                        !zone.isActive && t.prices.zoneHidden,
                        zone.isCustom && t.prices.customBadge,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  )}
                </th>
                {BODY_CLASSES.map((bodyClass) => {
                  const draft = draftOf(zone, bodyClass);
                  const classes = [
                    'matrix__cell',
                    isChanged(zone, bodyClass) && 'is-changed',
                    isIncomplete(zone, bodyClass) && 'is-invalid',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <td key={bodyClass} className={classes}>
                      <input
                        className="matrix__price num"
                        inputMode="numeric"
                        aria-label={`${zone.nameUz}, ${bodyClass}: ${t.prices.legend}`}
                        disabled={zone.isCustom}
                        placeholder={zone.isCustom || draft.minutes !== '' ? t.prices.agreed : '—'}
                        value={draft.price === '' ? '' : formatAmount(Number(draft.price))}
                        onChange={(event) =>
                          edit(zone, bodyClass, { price: digitsOf(event.target.value, 10) })
                        }
                      />
                      <span className="matrix__time">
                        <input
                          className="matrix__minutes"
                          inputMode="numeric"
                          aria-label={`${zone.nameUz}, ${bodyClass}: ${t.prices.minutes}`}
                          placeholder={t.prices.minutes}
                          value={draft.minutes}
                          onChange={(event) =>
                            edit(zone, bodyClass, { minutes: digitsOf(event.target.value, 5) })
                          }
                        />
                        <span className="muted matrix__human">
                          {draft.minutes === '' ? '' : formatDuration(Number(draft.minutes), lang)}
                        </span>
                      </span>
                      {isIncomplete(zone, bodyClass) && (
                        <span className="field__error">{t.prices.incomplete}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {zones.length === 0 && <p className="muted matrix__empty">{t.prices.emptyType}</p>}
        <div className="matrix__footer">
          <Button
            variant="ghost"
            icon={<Plus size={16} aria-hidden="true" />}
            onClick={() => setZoneForm({ id: null })}
          >
            {t.prices.addZone}
          </Button>
        </div>
      </section>

      {changes > 0 && (
        <UnsavedBar
          title={t.prices.changes(changes)}
          note={t.prices.changesNote}
          busy={save.isPending}
          canSave={!incomplete}
          onCancel={() => {
            save.reset();
            setEdits({});
          }}
          onSave={() => save.mutate()}
        />
      )}
    </>
  );
}

function TypeEditor({
  type,
  onClose,
  onSaved,
}: {
  type: ServiceType | null;
  onClose: () => void;
  onSaved: (type: ServiceType) => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const isNew = type === null;
  const [code, setCode] = useState('');
  const [nameUz, setNameUz] = useState(type?.nameUz ?? '');
  const [nameRu, setNameRu] = useState(type?.nameRu ?? '');
  const [icon, setIcon] = useState(type?.icon ?? 'sparkles');
  const [sort, setSort] = useState(String(type?.sort ?? ''));
  const [isActive, setIsActive] = useState(type?.isActive ?? true);

  const save = useMutation({
    mutationFn: () =>
      isNew
        ? call('admin.createServiceType', { body: { code, nameUz, nameRu, icon } })
        : call('admin.updateServiceType', {
            params: { id: type.id },
            body: { nameUz, nameRu, icon, sort: Number(sort), isActive },
          }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: SERVICE_TYPES_KEY });
      onSaved(result);
    },
  });
  const fields = invalidFields(save.error);
  const invalid = (name: string) => (fields.has(name) ? t.errors.validation : null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <form className="card form-stack prices__editor" onSubmit={submit}>
      <h2 className="section-title">{isNew ? t.prices.newType : t.prices.editType}</h2>
      {save.error && (
        <Notice tone="danger">
          {errorCodeOf(save.error) === 'name_taken'
            ? t.prices.nameTaken
            : genericMessage(save.error, t)}
        </Notice>
      )}
      {isNew && (
        <Field
          label={t.prices.typeCode}
          value={code}
          required
          maxLength={LIMITS.code.max}
          hint={t.prices.typeCodeHint}
          error={invalid('code')}
          onChange={(event) => setCode(event.target.value)}
        />
      )}
      <div className="form-row">
        <Field
          label={t.form.nameUz}
          value={nameUz}
          required
          maxLength={LIMITS.name.max}
          error={invalid('nameUz')}
          onChange={(event) => setNameUz(event.target.value)}
        />
        <Field
          label={t.form.nameRu}
          value={nameRu}
          required
          maxLength={LIMITS.name.max}
          error={invalid('nameRu')}
          onChange={(event) => setNameRu(event.target.value)}
        />
      </div>
      <Field
        label={t.prices.typeIcon}
        value={icon}
        required
        maxLength={40}
        hint={t.prices.typeIconHint}
        error={invalid('icon')}
        onChange={(event) => setIcon(event.target.value)}
      />
      {!isNew && (
        <>
          <Field
            label={t.form.sort}
            type="number"
            min={0}
            max={10_000}
            required
            value={sort}
            hint={t.form.sortHint}
            onChange={(event) => setSort(event.target.value)}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={!isActive}
              onChange={(event) => setIsActive(!event.target.checked)}
            />
            <span className="check__text">
              {t.form.hidden}
              <span className="muted">{t.form.hideHint}</span>
            </span>
          </label>
        </>
      )}
      <div className="prices__editor-actions">
        <Button type="submit" busy={save.isPending}>
          {t.form.save}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          {t.form.cancel}
        </Button>
      </div>
    </form>
  );
}

function ZoneEditor({
  type,
  zone,
  siblings,
  onClose,
}: {
  type: ServiceType;
  zone: Service | null;
  siblings: readonly Service[];
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const queryClient = useQueryClient();
  const isNew = zone === null;
  const [nameUz, setNameUz] = useState(zone?.nameUz ?? '');
  const [nameRu, setNameRu] = useState(zone?.nameRu ?? '');
  const [group, setGroup] = useState<ServiceGroup>(zone?.group ?? 'body');
  const [isCustom, setIsCustom] = useState(false);
  const [sort, setSort] = useState(String(zone?.sort ?? ''));
  const [isActive, setIsActive] = useState(zone?.isActive ?? true);
  const [excludes, setExcludes] = useState<string[]>(zone?.excludes ?? []);
  const others = siblings.filter((other) => other.id !== zone?.id);

  const save = useMutation({
    mutationFn: () =>
      isNew
        ? call('admin.createService', {
            body: { serviceTypeId: type.id, nameUz, nameRu, group, isCustom },
          })
        : call('admin.updateService', {
            params: { id: zone.id },
            body: { nameUz, nameRu, group, sort: Number(sort), isActive, excludes },
          }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: pricesKey(type.id) });
      onClose();
    },
  });
  const fields = invalidFields(save.error);
  const invalid = (name: string) => (fields.has(name) ? t.errors.validation : null);

  const toggleExclude = (id: string) =>
    setExcludes((previous) =>
      previous.includes(id) ? previous.filter((existing) => existing !== id) : [...previous, id],
    );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <form className="card form-stack prices__editor" onSubmit={submit}>
      <h2 className="section-title">{isNew ? t.prices.newZone : t.prices.editZone}</h2>
      {save.error && <Notice tone="danger">{genericMessage(save.error, t)}</Notice>}
      <div className="form-row">
        <Field
          label={t.form.nameUz}
          value={nameUz}
          required
          maxLength={LIMITS.name.max}
          error={invalid('nameUz')}
          onChange={(event) => setNameUz(event.target.value)}
        />
        <Field
          label={t.form.nameRu}
          value={nameRu}
          required
          maxLength={LIMITS.name.max}
          error={invalid('nameRu')}
          onChange={(event) => setNameRu(event.target.value)}
        />
      </div>
      <SelectField
        label={t.prices.group}
        value={group}
        onChange={(event) => setGroup(event.target.value as ServiceGroup)}
      >
        {SERVICE_GROUPS.map((value) => (
          <option key={value} value={value}>
            {t.prices.groups[value]}
          </option>
        ))}
      </SelectField>

      {isNew ? (
        <label className="check">
          <input
            type="checkbox"
            checked={isCustom}
            onChange={(event) => setIsCustom(event.target.checked)}
          />
          {t.prices.custom}
        </label>
      ) : (
        <>
          <Field
            label={t.form.sort}
            type="number"
            min={0}
            max={10_000}
            required
            value={sort}
            hint={t.form.sortHint}
            onChange={(event) => setSort(event.target.value)}
          />
          <fieldset className="form-stack split__fieldset">
            <legend className="field__label">{t.prices.excludes}</legend>
            <p className="muted field__hint">{t.prices.excludesHint}</p>
            {others.length === 0 && <p className="muted">{t.prices.noOtherZones}</p>}
            {others.map((other) => (
              <label key={other.id} className="check">
                <input
                  type="checkbox"
                  checked={excludes.includes(other.id)}
                  onChange={() => toggleExclude(other.id)}
                />
                {lang === 'ru' ? other.nameRu : other.nameUz}
              </label>
            ))}
          </fieldset>
          <label className="check">
            <input
              type="checkbox"
              checked={!isActive}
              onChange={(event) => setIsActive(!event.target.checked)}
            />
            <span className="check__text">
              {t.form.hidden}
              <span className="muted">{t.form.hideHint}</span>
            </span>
          </label>
        </>
      )}
      <div className="prices__editor-actions">
        <Button type="submit" busy={save.isPending}>
          {t.form.save}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          {t.form.cancel}
        </Button>
      </div>
    </form>
  );
}
