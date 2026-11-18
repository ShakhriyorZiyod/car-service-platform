import type { ClientCatalog } from '@cs/shared';
import { BODY_CLASSES, type BodyClass } from '@cs/shared/vocabulary';
import { useState, type FormEvent } from 'react';
import { useT } from '../i18n';
import { apiMessage, invalidFields } from '../lib/errors';
import { Button } from './Button';
import { Field } from './Field';
import { Notice } from './Notice';
import { SelectField } from './SelectField';

export interface CarValues {
  modelId: string | null;
  customModelText: string | null;
  bodyClass: BodyClass | null;
  year: number;
  plate: string;
  color: string | null;
}

const OTHER = '__other__';

/**
 * A car as the admin enters it for a client: the model from the list, or "Other" with the words
 * and a body class. The server checks everything again.
 */
export function CarForm({
  catalog,
  pending,
  error,
  onSubmit,
}: {
  catalog: ClientCatalog;
  pending: boolean;
  error: unknown;
  onSubmit: (values: CarValues) => void;
}) {
  const t = useT();
  const [brandId, setBrandId] = useState('');
  const [modelId, setModelId] = useState('');
  const [custom, setCustom] = useState('');
  const [bodyClass, setBodyClass] = useState<BodyClass>('M');
  const [year, setYear] = useState('');
  const [plate, setPlate] = useState('');
  const [color, setColor] = useState('');

  const isOther = brandId === OTHER;
  const models = catalog.brands.find((brand) => brand.id === brandId)?.models ?? [];
  const invalid = invalidFields(error);
  const ready =
    plate.trim() !== '' &&
    /^\d{4}$/.test(year) &&
    (isOther ? custom.trim() !== '' : modelId !== '');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    onSubmit({
      modelId: isOther ? null : modelId,
      customModelText: isOther ? custom.trim() : null,
      bodyClass: isOther ? bodyClass : null,
      year: Number(year),
      plate,
      color: color.trim() || null,
    });
  };

  return (
    <form className="form-stack" onSubmit={submit}>
      <div className="form-row">
        <SelectField
          label={t.carForm.brand}
          value={brandId}
          onChange={(event) => {
            setBrandId(event.target.value);
            setModelId('');
          }}
        >
          <option value="">{t.carForm.chooseBrand}</option>
          {catalog.brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
          <option value={OTHER}>{t.carForm.other}</option>
        </SelectField>
        {isOther ? (
          <Field
            label={t.carForm.customModel}
            value={custom}
            maxLength={60}
            error={invalid.has('customModelText') ? t.errors.validation : null}
            onChange={(event) => setCustom(event.target.value)}
          />
        ) : (
          <SelectField
            label={t.carForm.model}
            value={modelId}
            disabled={brandId === ''}
            error={invalid.has('modelId') ? t.errors.validation : null}
            onChange={(event) => setModelId(event.target.value)}
          >
            <option value="">{t.carForm.chooseModel}</option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </SelectField>
        )}
      </div>
      {isOther && (
        <SelectField
          label={t.carForm.bodyClass}
          value={bodyClass}
          onChange={(event) => setBodyClass(event.target.value as BodyClass)}
        >
          {BODY_CLASSES.map((value) => (
            <option key={value} value={value}>
              {value} · {t.brands.classNames[value]}
            </option>
          ))}
        </SelectField>
      )}
      <div className="form-row">
        <Field
          label={t.carForm.plate}
          hint={t.carForm.plateHint}
          value={plate}
          maxLength={20}
          error={invalid.has('plate') ? t.errors.validation : null}
          onChange={(event) => setPlate(event.target.value)}
        />
        <Field
          label={t.carForm.year}
          inputMode="numeric"
          value={year}
          maxLength={4}
          error={invalid.has('year') ? t.errors.validation : null}
          onChange={(event) => setYear(event.target.value.replace(/\D/g, ''))}
        />
      </div>
      <Field
        label={t.carForm.color}
        value={color}
        maxLength={40}
        onChange={(event) => setColor(event.target.value)}
      />
      {error !== null && error !== undefined && (
        <Notice tone="danger">{apiMessage(error, t)}</Notice>
      )}
      <div className="dialog__actions">
        <Button type="submit" busy={pending} disabled={!ready}>
          {t.carForm.submit}
        </Button>
      </div>
    </form>
  );
}
