import type { Order, ShopOrder } from '@cs/shared';
import type { OrderTab } from '@cs/shared/vocabulary';
import { ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../../../i18n';
import { errorText, useOrders, useShopOrders } from '../../../lib/client-data';
import { EmptyState, OrderCard, ShopOrderCard, Skeleton } from '../../../ui/client-parts';
import { Notice } from '../../../ui/Notice';
import { Segmented } from '../../../ui/Segmented';

type Entry =
  { kind: 'order'; order: Order; at: string } | { kind: 'shop'; order: ShopOrder; at: string };

/**
 * T9: "My orders", the active ones and the history apart, the service orders and the shop's
 * together (client PDF, page 10): a service order by its visit, a shop order by when it was placed,
 * the latest first.
 */
export function OrdersScreen({
  onOpen,
  onOpenShop,
}: {
  onOpen: (orderId: string) => void;
  onOpenShop: (shopOrderId: string) => void;
}) {
  const t = useT().client;
  const [tab, setTab] = useState<OrderTab>('active');
  const orders = useOrders(tab);
  const shopOrders = useShopOrders(tab);

  const entries: Entry[] = [
    ...(orders.data?.items ?? []).map((order): Entry => ({
      kind: 'order',
      order,
      at: order.startsAt.at,
    })),
    ...(shopOrders.data?.items ?? []).map((order): Entry => ({
      kind: 'shop',
      order,
      at: order.createdAt.at,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const pending = orders.isPending || shopOrders.isPending;
  const error = orders.error ?? shopOrders.error;

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
      {pending && <Skeleton />}
      {error && <Notice tone="danger">{errorText(t, error)}</Notice>}
      {!pending && !error && entries.length === 0 && (
        <EmptyState
          icon={<ClipboardList size={28} />}
          title={tab === 'active' ? t.orders.emptyActive : t.orders.emptyHistory}
        />
      )}
      <ul className="list">
        {entries.map((entry) => (
          <li key={`${entry.kind}-${entry.order.id}`}>
            {entry.kind === 'order' ? (
              <OrderCard order={entry.order} onOpen={() => onOpen(entry.order.id)} />
            ) : (
              <ShopOrderCard order={entry.order} onOpen={() => onOpenShop(entry.order.id)} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
