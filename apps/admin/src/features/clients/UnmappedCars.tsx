import type { UnmappedCar } from '@cs/shared';
import { BODY_CLASSES, type BodyClass } from '@cs/shared/vocabulary';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { call } from '../../api';
import { useCan } from '../../auth/session';
import { useT } from '../../i18n';
import { apiMessage } from '../../lib/errors';
import { CATALOG_KEY, CLIENTS_KEY, UNMAPPED_CARS_KEY } from '../../lib/keys';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Notice } from '../../ui/Notice';
import { PlateChip } from '../../ui/PlateChip';
import { SelectField } from '../../ui/SelectField';

/**
 * Cars added with "Other": the client typed the model. The admin ties each to a real one, since
 * prices and times follow the model's body class (docs/PLAN.md, section 7.6).
 */
export function UnmappedCars() {
  const t = useT();
  const can = useCan();
  const [mapping, setMapping] = useState<UnmappedCar | null>(null);
  const cars = useQuery({
    queryKey: UNMAPPED_CARS_KEY,
    queryFn: () => call('admin.unmappedCars'),
  });
  const items = cars.data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <section className="card unmapped">
      <h2 className="section-title">{t.clients.unmapped.title(items.length)}</h2>
      <p className="muted">{t.clients.unmapped.lead}</p>
      <ul className="unmapped__rows">
        {items.map((car) => (
          <li key={car.id} className="unmapped__row">
            <span className="unmapped__text">
              <strong>{car.clientName}</strong>
              <span className="muted">
                {t.clients.unmapped.typed}: {car.customModelText ?? t.common.none} · {car.year} ·{' '}
                {car.bodyClass}
              </span>
            </span>
            <PlateChip plate={car.plate} />
            {can('clients.write') && (
              <Button variant="secondary" onClick={() => setMapping(car)}>
                {t.clients.unmapped.map}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {mapping && <MapDialog car={mapping} onClose={() => setMapping(null)} />}
    </section>
  );
}

function MapDialog({ car, onClose }: { car: UnmappedCar; onClose: () => void }) {
  const t = useT();
  const queryClient = useQueryClient();
  const catalog = useQuery({
    queryKey: CATALOG_KEY,
    queryFn: () => call('admin.catalog'),
    staleTime: 5 * 60_000,
  });
  const [brandId, setBrandId] = useState('');
  const [modelId, setModelId] = useState('');
  const [bodyClass, setBodyClass] = useState<BodyClass | ''>('');

  const models = catalog.data?.brands.find((brand) => brand.id === brandId)?.models ?? [];
  const map = useMutation({
    mutationFn: () =>
      call('admin.mapCar', {
        params: { id: car.id },
        body: { modelId, ...(bodyClass && { bodyClass }) },
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: UNMAPPED_CARS_KEY }),
        queryClient.invalidateQueries({ queryKey: CLIENTS_KEY }),
        queryClient.invalidateQueries({ queryKey: ['client'] }),
      ]);
      onClose();
    },
    // Mapped by somebody else meanwhile: the list refreshes and the car drops out.
    onError: () => queryClient.invalidateQueries({ queryKey: UNMAPPED_CARS_KEY }),
  });

  return (
    <Dialog title={t.clients.unmapped.mapTitle} onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (modelId) map.mutate();
        }}
      >
        <p>
          <strong>{car.clientName}</strong>
          <span className="muted">
            {' · '}
            {t.clients.unmapped.typed}: {car.customModelText ?? t.common.none}
          </span>
        </p>
        <div className="form-row">
          <SelectField
            label={t.clients.unmapped.brand}
            value={brandId}
            onChange={(event) => {
              setBrandId(event.target.value);
              setModelId('');
            }}
          >
            <option value="">{t.carForm.chooseBrand}</option>
            {catalog.data?.brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t.clients.unmapped.model}
            value={modelId}
            disabled={brandId === ''}
            onChange={(event) => setModelId(event.target.value)}
          >
            <option value="">{t.carForm.chooseModel}</option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} · {model.bodyClass}
              </option>
            ))}
          </SelectField>
        </div>
        <SelectField
          label={t.clients.unmapped.bodyClass}
          hint={t.clients.unmapped.classHint}
          value={bodyClass}
          onChange={(event) => setBodyClass(event.target.value as BodyClass | '')}
        >
          <option value="">{t.clients.unmapped.fromModel}</option>
          {BODY_CLASSES.map((value) => (
            <option key={value} value={value}>
              {value} · {t.brands.classNames[value]}
            </option>
          ))}
        </SelectField>
        {map.isError && <Notice tone="danger">{apiMessage(map.error, t)}</Notice>}
        <div className="dialog__actions">
          <Button variant="secondary" onClick={onClose}>
            {t.form.cancel}
          </Button>
          <Button type="submit" busy={map.isPending} disabled={modelId === ''}>
            {t.clients.unmapped.submit}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
