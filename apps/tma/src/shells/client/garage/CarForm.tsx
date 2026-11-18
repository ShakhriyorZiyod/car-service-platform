import type { Car } from '@cs/shared';
import { BODY_CLASSES, type BodyClass } from '@cs/shared/vocabulary';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useApi } from '../../../bootstrap';
import { useT } from '../../../i18n';
import { CARS_KEY, errorText, useCars, useCatalog } from '../../../lib/client-data';
import { Button } from '../../../ui/Button';
import { ScreenHeader } from '../../../ui/client-parts';
import { Notice } from '../../../ui/Notice';
import { PhoneGate } from '../../../ui/PhoneGate';

const OTHER = 'other';

/** T2: a car for the garage: brand, model (or "Other" with a body class), year, plate, colour. */
export function CarForm({
  carId,
  onDone,
  onBack,
}: {
  carId?: string | undefined;
  onDone: (car: Car) => void;
  onBack: () => void;
}) {
  const t = useT().client;
  const api = useApi();
  const queryClient = useQueryClient();
  const catalog = useCatalog();
  const cars = useCars();
  const existing = cars.data?.items.find((car) => car.id === carId) ?? null;

  const initialBrand =
    catalog.data?.brands.find((brand) =>
      brand.models.some((model) => model.id === existing?.modelId),
    )?.id ?? '';
  const [brandId, setBrandId] = useState(initialBrand);
  const [modelId, setModelId] = useState<string>(existing ? (existing.modelId ?? OTHER) : '');
  const [customText, setCustomText] = useState(existing?.customModelText ?? '');
  const [customClass, setCustomClass] = useState<BodyClass | null>(
    existing && existing.modelId === null ? existing.bodyClass : null,
  );
  const [year, setYear] = useState(existing ? String(existing.year) : '');
  const [plate, setPlate] = useState(existing?.plate ?? '');
  const [color, setColor] = useState(existing?.color ?? '');

  const brand = catalog.data?.brands.find((candidate) => candidate.id === brandId);
  const isOther = modelId === OTHER;
  const chosenModel = brand?.models.find((model) => model.id === modelId);
  const bodyClass = isOther ? customClass : (chosenModel?.bodyClass ?? existing?.bodyClass ?? null);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        modelId: isOther ? null : modelId,
        customModelText: isOther ? customText.trim() : null,
        bodyClass: isOther ? customClass : null,
        year: Number(year),
        plate,
        color: color.trim() || null,
      };
      return carId
        ? api.call('client.updateCar', { params: { id: carId }, body })
        : api.call('client.createCar', { body });
    },
    onSuccess: async (car) => {
      await queryClient.invalidateQueries({ queryKey: CARS_KEY });
      onDone(car);
    },
  });

  const ready =
    (isOther ? customText.trim() !== '' && customClass !== null : modelId !== '') &&
    /^\d{4}$/.test(year) &&
    plate.trim() !== '';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (ready) save.mutate();
  };

  return (
    <PhoneGate>
      <form className="screen" onSubmit={submit}>
        <ScreenHeader title={carId ? t.car.editTitle : t.car.title} onBack={onBack} />
        {save.isError && <Notice tone="danger">{errorText(t, save.error)}</Notice>}

        <div className="field">
          <span className="field__label">{t.car.brand}</span>
          <div className="chips">
            {catalog.data?.brands.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className={candidate.id === brandId ? 'chip-choice is-selected' : 'chip-choice'}
                onClick={() => {
                  setBrandId(candidate.id);
                  setModelId('');
                }}
              >
                {candidate.name}
              </button>
            ))}
            <button
              type="button"
              className={isOther ? 'chip-choice is-selected' : 'chip-choice'}
              onClick={() => {
                setBrandId('');
                setModelId(OTHER);
              }}
            >
              {t.car.other}
            </button>
          </div>
        </div>

        {brand && !isOther && (
          <div className="field">
            <span className="field__label">{t.car.model}</span>
            <div className="chips">
              {brand.models.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  className={model.id === modelId ? 'chip-choice is-selected' : 'chip-choice'}
                  onClick={() => setModelId(model.id)}
                >
                  {model.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {isOther && (
          <>
            <label className="field">
              <span className="field__label">{t.car.customModel}</span>
              <input
                className="field__input"
                value={customText}
                maxLength={60}
                onChange={(event) => setCustomText(event.target.value)}
              />
              <span className="secondary">{t.car.customHint}</span>
            </label>
            <div className="field">
              <span className="field__label">{t.car.pickClass}</span>
              <div className="class-grid">
                {BODY_CLASSES.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    className={candidate === customClass ? 'class-card is-selected' : 'class-card'}
                    onClick={() => setCustomClass(candidate)}
                  >
                    <span className="num">{candidate}</span>
                    <span className="secondary">{t.car.classes[candidate]}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {bodyClass && !isOther && <p className="secondary">{t.car.classLine(bodyClass)}</p>}

        <label className="field">
          <span className="field__label">{t.car.year}</span>
          <input
            className="field__input"
            inputMode="numeric"
            maxLength={4}
            value={year}
            onChange={(event) => setYear(event.target.value.replace(/\D/g, ''))}
          />
        </label>
        <label className="field">
          <span className="field__label">{t.car.plate}</span>
          <input
            className="field__input"
            autoCapitalize="characters"
            maxLength={16}
            placeholder={t.car.plateHint}
            value={plate}
            onChange={(event) => setPlate(event.target.value.toUpperCase())}
          />
        </label>
        <label className="field">
          <span className="field__label">{t.car.color}</span>
          <input
            className="field__input"
            maxLength={40}
            value={color}
            onChange={(event) => setColor(event.target.value)}
          />
        </label>

        <Button type="submit" busy={save.isPending} disabled={!ready}>
          {t.car.save}
        </Button>
      </form>
    </PhoneGate>
  );
}
