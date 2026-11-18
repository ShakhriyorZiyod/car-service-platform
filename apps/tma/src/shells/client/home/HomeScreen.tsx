import type { Bootstrap } from '@cs/shared';
import { Car as CarIcon } from 'lucide-react';
import { useT } from '../../../i18n';
import { useCars, useOrders } from '../../../lib/client-data';
import { Button } from '../../../ui/Button';
import { EmptyState, OrderCard, Skeleton } from '../../../ui/client-parts';

/** T1: the home screen: a greeting, the order in progress, and the way to book (client PDF, p. 1). */
export function HomeScreen({
  bootstrap,
  onBook,
  onAddCar,
  onOpenOrder,
}: {
  bootstrap: Bootstrap;
  onBook: () => void;
  onAddCar: () => void;
  onOpenOrder: (orderId: string) => void;
}) {
  const t = useT().client;
  const cars = useCars();
  const active = useOrders('active');
  const firstName = bootstrap.user.fullName.split(' ')[0] ?? bootstrap.user.fullName;
  const noCars = cars.isSuccess && cars.data.items.length === 0;
  const hasPhone = bootstrap.user.phone !== null;

  return (
    <section className="screen">
      <h1 className="title-xl">{t.home.greeting(firstName)}</h1>

      {hasPhone && (cars.isPending || active.isPending) && <Skeleton />}

      {noCars || !hasPhone ? (
        <EmptyState
          icon={<CarIcon size={28} />}
          title={t.home.emptyTitle}
          text={t.home.emptyText}
          action={<Button onClick={onAddCar}>{t.home.addCar}</Button>}
        />
      ) : (
        <>
          <Button onClick={onBook}>{t.home.book}</Button>
          <h2 className="title">{t.home.activeOrder}</h2>
          {active.isSuccess && active.data.items.length === 0 && (
            <p className="secondary">{t.home.noActive}</p>
          )}
          {active.data?.items.slice(0, 2).map((order) => (
            <OrderCard key={order.id} order={order} onOpen={() => onOpenOrder(order.id)} />
          ))}
        </>
      )}
    </section>
  );
}
