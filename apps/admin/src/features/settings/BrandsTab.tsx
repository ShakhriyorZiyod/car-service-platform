import type { CarBrand, CarModel } from '@cs/shared';
import { BODY_CLASSES, LIMITS, type BodyClass } from '@cs/shared/vocabulary';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { call } from '../../api';
import { useT } from '../../i18n';
import { errorCodeOf, genericMessage, invalidFields } from '../../lib/errors';
import { BRANDS_KEY } from '../../lib/keys';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Notice } from '../../ui/Notice';

/** "Markalar va modellar": every model has the body class that sets its prices (PLAN 7.5). */
export function BrandsTab() {
  const t = useT();
  const brands = useQuery({ queryKey: BRANDS_KEY, queryFn: () => call('admin.brands') });
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const items = brands.data?.items ?? [];
  const currentId = creating ? null : (selectedId ?? items[0]?.id ?? null);
  const current = items.find((brand) => brand.id === currentId) ?? null;
  const select = (id: string) => {
    setCreating(false);
    setSelectedId(id);
  };

  return (
    <div className="split">
      <section className="card split__list">
        <header className="split__head">
          <h2 className="section-title">{t.brands.count(items.length)}</h2>
          <Button icon={<Plus size={16} aria-hidden="true" />} onClick={() => setCreating(true)}>
            {t.brands.add}
          </Button>
        </header>
        {brands.isError && <Notice tone="danger">{genericMessage(brands.error, t)}</Notice>}
        <ul className="split__rows">
          {items.map((brand) => (
            <li key={brand.id}>
              <button
                type="button"
                className={brand.id === currentId ? 'split__row is-active' : 'split__row'}
                onClick={() => select(brand.id)}
              >
                <span className="split__row-text">
                  <span className="split__row-name">{brand.name}</span>
                  <span className="muted">{t.brands.models(brand.models.length)}</span>
                </span>
                {!brand.isActive && <span className="chip chip--danger">{t.form.hidden}</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        {creating ? (
          <BrandEditor key="new" brand={null} onSaved={(brand) => select(brand.id)} />
        ) : current ? (
          <BrandEditor key={current.id} brand={current} onSaved={() => undefined} />
        ) : null}
      </section>
    </div>
  );
}

function BrandEditor({
  brand,
  onSaved,
}: {
  brand: CarBrand | null;
  onSaved: (brand: CarBrand) => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const isNew = brand === null;
  const [name, setName] = useState(brand?.name ?? '');
  const [sort, setSort] = useState(String(brand?.sort ?? ''));
  const [isActive, setIsActive] = useState(brand?.isActive ?? true);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      isNew
        ? call('admin.createBrand', { body: { name } })
        : call('admin.updateBrand', {
            params: { id: brand.id },
            body: { name, sort: Number(sort), isActive },
          }),
    onSuccess: async (result) => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: BRANDS_KEY });
      onSaved(result);
    },
    onError: () => setSaved(false),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <div className="split__editor">
      <form className="form-stack" onSubmit={submit}>
        <h2 className="section-title">{isNew ? t.brands.newTitle : brand.name}</h2>
        {saved && <Notice tone="success">{t.form.saved}</Notice>}
        {save.error && (
          <Notice tone="danger">
            {errorCodeOf(save.error) === 'name_taken'
              ? t.form.nameTaken
              : genericMessage(save.error, t)}
          </Notice>
        )}
        <Field
          label={t.brands.brandName}
          value={name}
          required
          maxLength={LIMITS.name.max}
          error={invalidFields(save.error).has('name') ? t.errors.validation : null}
          onChange={(event) => {
            setSaved(false);
            setName(event.target.value);
          }}
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
        <div>
          <Button type="submit" busy={save.isPending}>
            {isNew ? t.brands.add : t.form.save}
          </Button>
        </div>
      </form>

      {!isNew && <Models brand={brand} />}
    </div>
  );
}

function Models({ brand }: { brand: CarBrand }) {
  const t = useT();
  return (
    <section className="models">
      <h3 className="section-title">{t.brands.models(brand.models.length)}</h3>
      <p className="muted field__hint">{t.brands.classHint}</p>
      {brand.models.length === 0 && <p className="muted">{t.brands.noModels}</p>}
      <ul className="models__rows">
        {brand.models.map((model) => (
          <ModelRow key={model.id} model={model} />
        ))}
        <NewModelRow key={`new-${brand.models.length}`} brandId={brand.id} />
      </ul>
      <dl className="models__legend">
        {BODY_CLASSES.map((bodyClass) => (
          <div key={bodyClass}>
            <dt className="num">{bodyClass}</dt>
            <dd className="muted">{t.brands.classNames[bodyClass]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ClassSelect({
  value,
  onChange,
}: {
  value: BodyClass;
  onChange: (value: BodyClass) => void;
}) {
  const t = useT();
  return (
    <select
      className="field__input models__class"
      aria-label={t.brands.bodyClass}
      title={`${value}: ${t.brands.classNames[value]}`}
      value={value}
      onChange={(event) => onChange(event.target.value as BodyClass)}
    >
      {BODY_CLASSES.map((bodyClass) => (
        <option key={bodyClass} value={bodyClass}>
          {bodyClass}
        </option>
      ))}
    </select>
  );
}

function ModelRow({ model }: { model: CarModel }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [name, setName] = useState(model.name);
  const [bodyClass, setBodyClass] = useState<BodyClass>(model.bodyClass);
  const [isActive, setIsActive] = useState(model.isActive);
  const dirty = name !== model.name || bodyClass !== model.bodyClass || isActive !== model.isActive;

  const save = useMutation({
    mutationFn: () =>
      call('admin.updateModel', { params: { id: model.id }, body: { name, bodyClass, isActive } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BRANDS_KEY }),
  });

  return (
    <li className={isActive ? 'models__row' : 'models__row is-hidden'}>
      <input
        className="field__input models__name"
        aria-label={t.brands.modelName}
        value={name}
        maxLength={LIMITS.name.max}
        onChange={(event) => setName(event.target.value)}
      />
      <ClassSelect value={bodyClass} onChange={setBodyClass} />
      <label className="check models__hide">
        <input
          type="checkbox"
          checked={!isActive}
          onChange={(event) => setIsActive(!event.target.checked)}
        />
        {t.form.hidden}
      </label>
      <Button
        variant="secondary"
        disabled={!dirty || name.trim() === ''}
        busy={save.isPending}
        onClick={() => save.mutate()}
      >
        {t.form.save}
      </Button>
      {save.error && (
        <span className="field__error models__error">
          {errorCodeOf(save.error) === 'name_taken'
            ? t.form.nameTaken
            : genericMessage(save.error, t)}
        </span>
      )}
    </li>
  );
}

function NewModelRow({ brandId }: { brandId: string }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [bodyClass, setBodyClass] = useState<BodyClass>('M');

  const add = useMutation({
    mutationFn: () => call('admin.createModel', { body: { brandId, name, bodyClass } }),
    onSuccess: async () => {
      setName('');
      await queryClient.invalidateQueries({ queryKey: BRANDS_KEY });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    add.mutate();
  };

  return (
    <li className="models__row models__row--new">
      <form className="models__new-form" onSubmit={submit}>
        <input
          className="field__input models__name"
          aria-label={t.brands.modelName}
          placeholder={t.brands.modelName}
          value={name}
          required
          maxLength={LIMITS.name.max}
          onChange={(event) => setName(event.target.value)}
        />
        <ClassSelect value={bodyClass} onChange={setBodyClass} />
        <Button
          type="submit"
          variant="secondary"
          busy={add.isPending}
          disabled={name.trim() === ''}
        >
          {t.brands.addModel}
        </Button>
      </form>
      {add.error && (
        <span className="field__error models__error">
          {errorCodeOf(add.error) === 'name_taken'
            ? t.form.nameTaken
            : genericMessage(add.error, t)}
        </span>
      )}
    </li>
  );
}
