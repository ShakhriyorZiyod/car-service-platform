import type { OrderTab } from '@cs/shared/vocabulary';
import { ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../../../i18n';
import { errorText, useOrders } from '../../../lib/client-data';
import { EmptyState, OrderCard, Skeleton } from '../../../ui/client-parts';
import { Notice } from '../../../ui/Notice';
import { Segmented } from '../../../ui/Segmented';

/** T9: "My orders", the active ones and the history apart (client PDF, page 10). */
export function OrdersScreen({ onOpen }: { onOpen: (orderId: string) => void }) {
  const t = useT().client;
  const [tab, setTab] = useState<OrderTab>('active');
  const orders = useOrders(tab);

  return (
    <section className="screen">
      <h1 className="title-xl">{t.orders.title}</h1>
      <Segmented
        label={t.orders.title}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'active', label: t.orders.active },
          { value: 'history', label: t.orders.historyTab },
        ]}
      />
      {orders.isPending && <Skeleton />}
      {orders.isError && <Notice tone="danger">{errorText(t, orders.error)}</Notice>}
      {orders.isSuccess && orders.data.items.length === 0 && (
        <EmptyState
          icon={<ClipboardList size={28} />}
          title={tab === 'active' ? t.orders.emptyActive : t.orders.emptyHistory}
        />
      )}
      <ul className="list">
        {orders.data?.items.map((order) => (
          <li key={order.id}>
            <OrderCard order={order} onOpen={() => onOpen(order.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
