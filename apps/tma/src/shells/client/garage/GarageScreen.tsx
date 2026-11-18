import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Car as CarIcon, Plus } from 'lucide-react';
import { useApi } from '../../../bootstrap';
import { useT } from '../../../i18n';
import { CARS_KEY, errorText, useCars } from '../../../lib/client-data';
import { Button } from '../../../ui/Button';
import { EmptyState, PlateChip, Skeleton } from '../../../ui/client-parts';
import { Notice } from '../../../ui/Notice';
import { PhoneGate } from '../../../ui/PhoneGate';

/** "My garage": the client's cars; each can be changed or taken out (client PDF, T1 and page 17). */
export function GarageScreen({
  onAdd,
  onEdit,
}: {
  onAdd: () => void;
  onEdit: (carId: string) => void;
}) {
  const t = useT().client;
  const api = useApi();
  const queryClient = useQueryClient();
  const cars = useCars();

  const archive = useMutation({
    mutationFn: (id: string) => api.call('client.archiveCar', { params: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CARS_KEY }),
  });

  return (
    <PhoneGate>
      <section className="screen">
        <h1 className="title-xl">{t.garage.title}</h1>
        {cars.isPending && <Skeleton />}
        {cars.isError && <Notice tone="danger">{errorText(t, cars.error)}</Notice>}
        {archive.isError && <Notice tone="danger">{errorText(t, archive.error)}</Notice>}
        {cars.isSuccess && cars.data.items.length === 0 && (
          <EmptyState
            icon={<CarIcon size={28} />}
            title={t.garage.empty}
            text={t.home.emptyText}
            action={<Button onClick={onAdd}>{t.garage.add}</Button>}
          />
        )}
        <ul className="list">
          {cars.data?.items.map((car) => (
            <li key={car.id} className="card car-row">
              <div className="car-row__main">
                <span className="car-row__name">
                  {car.brand ? `${car.brand} ${car.model}` : car.model}
                </span>
                <span className="secondary">
                  {car.year}
                  {car.color ? `, ${car.color}` : ''} · {car.bodyClass}
                </span>
                <PlateChip plate={car.plate} />
              </div>
              <div className="car-row__actions">
                <Button variant="link" onClick={() => onEdit(car.id)}>
                  {t.garage.edit}
                </Button>
                <Button
                  variant="link"
                  busy={archive.isPending && archive.variables === car.id}
                  onClick={() => archive.mutate(car.id)}
                >
                  {t.garage.archive}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {cars.isSuccess && cars.data.items.length > 0 && (
          <Button variant="secondary" icon={<Plus size={20} aria-hidden="true" />} onClick={onAdd}>
            {t.garage.add}
          </Button>
        )}
      </section>
    </PhoneGate>
  );
}
