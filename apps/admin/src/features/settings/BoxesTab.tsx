import type { Box, ServiceType } from '@cs/shared';
import { LIMITS } from '@cs/shared/vocabulary';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { call } from '../../api';
import { useLang, useT } from '../../i18n';
import { genericMessage, invalidFields } from '../../lib/errors';
import { SERVICE_TYPES_KEY } from '../../lib/keys';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Notice } from '../../ui/Notice';

const BOXES_KEY = ['boxes'] as const;

/** "Bokslar": the work bays and the kinds of work each can do (PLAN 7.4). */
export function BoxesTab() {
  const t = useT();
  const lang = useLang();
  const boxes = useQuery({ queryKey: BOXES_KEY, queryFn: () => call('admin.boxes') });
  const types = useQuery({
    queryKey: SERVICE_TYPES_KEY,
    queryFn: () => call('admin.serviceTypes'),
  });
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const items = boxes.data?.items ?? [];
  const typeItems = types.data?.items ?? [];
  const typeName = (type: ServiceType) => (lang === 'ru' ? type.nameRu : type.nameUz);
  const currentId = creating ? null : (selectedId ?? items[0]?.id ?? null);
  const current = items.find((box) => box.id === currentId) ?? null;
  const select = (id: string) => {
    setCreating(false);
    setSelectedId(id);
  };

  return (
    <div className="split">
      <section className="card split__list">
        <header className="split__head">
          <h2 className="section-title">{t.boxes.count(items.length)}</h2>
          <Button icon={<Plus size={16} aria-hidden="true" />} onClick={() => setCreating(true)}>
            {t.boxes.add}
          </Button>
        </header>
        {boxes.isError && <Notice tone="danger">{genericMessage(boxes.error, t)}</Notice>}
        {boxes.isSuccess && items.length === 0 && (
          <p className="muted split__head">{t.boxes.empty}</p>
        )}
        <ul className="split__rows">
          {items.map((box) => (
            <li key={box.id}>
              <button
                type="button"
                className={box.id === currentId ? 'split__row is-active' : 'split__row'}
                onClick={() => select(box.id)}
              >
                <span className="split__row-text">
                  <span className="split__row-name">{box.name}</span>
                  <span className="muted">
                    {typeItems
                      .filter((type) => box.serviceTypeIds.includes(type.id))
                      .map(typeName)
                      .join(', ') || t.boxes.noTypes}
                  </span>
                </span>
                {!box.isActive && <span className="chip chip--danger">{t.boxes.stopped}</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        {creating ? (
          <BoxEditor key="new" box={null} types={typeItems} onSaved={(box) => select(box.id)} />
        ) : current ? (
          <BoxEditor key={current.id} box={current} types={typeItems} onSaved={() => undefined} />
        ) : null}
      </section>
    </div>
  );
}

interface Form {
  name: string;
  note: string;
  serviceTypeIds: string[];
  isActive: boolean;
  sort: string;
}

function BoxEditor({
  box,
  types,
  onSaved,
}: {
  box: Box | null;
  types: readonly ServiceType[];
  onSaved: (box: Box) => void;
}) {
  const t = useT();
  const lang = useLang();
  const queryClient = useQueryClient();
  const isNew = box === null;
  const [form, setForm] = useState<Form>({
    name: box?.name ?? '',
    note: box?.note ?? '',
    serviceTypeIds: box?.serviceTypeIds ?? [],
    isActive: box?.isActive ?? true,
    sort: String(box?.sort ?? ''),
  });
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setSaved(false);
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const save = useMutation({
    mutationFn: () => {
      const common = {
        name: form.name,
        note: form.note.trim() || null,
        serviceTypeIds: form.serviceTypeIds,
      };
      return isNew
        ? call('admin.createBox', { body: common })
        : call('admin.updateBox', {
            params: { id: box.id },
            body: { ...common, isActive: form.isActive, sort: Number(form.sort) },
          });
    },
    onSuccess: async (result) => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: BOXES_KEY });
      onSaved(result);
    },
    onError: () => setSaved(false),
  });
  const fields = invalidFields(save.error);

  const toggleType = (id: string) =>
    set(
      'serviceTypeIds',
      form.serviceTypeIds.includes(id)
        ? form.serviceTypeIds.filter((existing) => existing !== id)
        : [...form.serviceTypeIds, id],
    );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <form className="split__editor" onSubmit={submit}>
      <h2 className="section-title">{isNew ? t.boxes.newTitle : box.name}</h2>
      {saved && <Notice tone="success">{t.form.saved}</Notice>}
      {save.error && <Notice tone="danger">{genericMessage(save.error, t)}</Notice>}

      <Field
        label={t.form.name}
        value={form.name}
        required
        maxLength={LIMITS.name.max}
        error={fields.has('name') ? t.errors.validation : null}
        onChange={(event) => set('name', event.target.value)}
      />
      <Field
        label={t.form.note}
        value={form.note}
        maxLength={LIMITS.note.max}
        hint={t.boxes.noteHint}
        error={fields.has('note') ? t.errors.validation : null}
        onChange={(event) => set('note', event.target.value)}
      />

      <fieldset className="form-stack split__fieldset">
        <legend className="field__label">{t.boxes.types}</legend>
        <p className="muted field__hint">{t.boxes.typesHint}</p>
        {types.map((type) => (
          <label key={type.id} className="check">
            <input
              type="checkbox"
              checked={form.serviceTypeIds.includes(type.id)}
              onChange={() => toggleType(type.id)}
            />
            <span>{lang === 'ru' ? type.nameRu : type.nameUz}</span>
          </label>
        ))}
        {form.serviceTypeIds.length === 0 && <Notice tone="warning">{t.boxes.noTypes}</Notice>}
      </fieldset>

      {!isNew && (
        <>
          <Field
            label={t.form.sort}
            type="number"
            min={0}
            max={10_000}
            required
            value={form.sort}
            hint={t.form.sortHint}
            onChange={(event) => set('sort', event.target.value)}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => set('isActive', event.target.checked)}
            />
            {t.boxes.working}
          </label>
        </>
      )}

      <div>
        <Button type="submit" busy={save.isPending}>
          {isNew ? t.boxes.create : t.form.save}
        </Button>
      </div>
    </form>
  );
}
