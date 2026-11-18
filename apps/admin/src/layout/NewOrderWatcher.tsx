import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { call } from '../api';
import { useCan } from '../auth/session';
import { ORDERS_KEY, POLL_MS } from '../lib/keys';
import { playNewOrderSound } from '../lib/sound';

/**
 * Asks for the orders in progress every 10 seconds, on every screen, and plays a sound when one
 * appears that was not there before (docs/PLAN.md, stage 4). It keeps asking in a background
 * tab: a request that arrives while the admin is on another window must still be heard.
 */
export function NewOrderWatcher() {
  const can = useCan();
  const allowed = can('orders.write');
  const seen = useRef<Set<string> | null>(null);

  const orders = useQuery({
    queryKey: [...ORDERS_KEY, 'watch'],
    queryFn: () => call('admin.orders', { query: {} }),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
    enabled: allowed,
  });

  useEffect(() => {
    if (!orders.data) return;
    const waiting = new Set(
      orders.data.items.filter((order) => order.status === 'new').map((order) => order.id),
    );
    // The first answer only says what is already there.
    if (seen.current && [...waiting].some((id) => !seen.current?.has(id))) playNewOrderSound();
    seen.current = waiting;
  }, [orders.data]);

  return null;
}
