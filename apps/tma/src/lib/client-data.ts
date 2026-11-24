import type { Lang } from '@cs/shared/i18n';
import type { OrderTab } from '@cs/shared/vocabulary';
import { useQuery } from '@tanstack/react-query';
import { ApiRequestError } from '../api';
import { useApi } from '../bootstrap';
import type { Texts } from '../i18n';

/** What the client's screens read from the server, with one key per kind of data. */

export const CATALOG_KEY = ['catalog'] as const;
export const CARS_KEY = ['cars'] as const;
export const ordersKey = (tab: OrderTab) => ['orders', tab] as const;
export const orderKey = (id: string) => ['order', id] as const;

export function useCatalog() {
  const api = useApi();
  // Brands, models and prices change rarely: a few minutes old is fine.
  return useQuery({
    queryKey: CATALOG_KEY,
    queryFn: () => api.call('client.catalog'),
    staleTime: 5 * 60_000,
  });
}

export function useCars() {
  const api = useApi();
  return useQuery({ queryKey: CARS_KEY, queryFn: () => api.call('client.cars') });
}

export function useOrders(tab: OrderTab) {
  const api = useApi();
  return useQuery({
    queryKey: ordersKey(tab),
    queryFn: () => api.call('client.orders', { query: { tab } }),
  });
}

/** While the car is with the workshop the screen is refreshed now and then: its zones get done. */
const LIVE_STATUSES: readonly string[] = ['confirmed', 'in_work', 'ready_for_pickup'];

export function useOrder(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: orderKey(id),
    queryFn: () => api.call('client.order', { params: { id } }),
    refetchInterval: (query) =>
      LIVE_STATUSES.includes(query.state.data?.status ?? '') ? 15_000 : false,
  });
}

// The shop (stage 9)
export const shopOrdersKey = (tab: OrderTab) => ['shopOrders', tab] as const;
export const shopOrderKey = (id: string) => ['shopOrder', id] as const;

export function useShopOrders(tab: OrderTab) {
  const api = useApi();
  return useQuery({
    queryKey: shopOrdersKey(tab),
    queryFn: () => api.call('client.shopOrders', { query: { tab } }),
  });
}

/** While the order is open its screen is refreshed now and then: the workshop moves it on. */
export function useShopOrder(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: shopOrderKey(id),
    queryFn: () => api.call('client.shopOrder', { params: { id } }),
    refetchInterval: (query) =>
      ['new', 'confirmed', 'ready_for_pickup'].includes(query.state.data?.status ?? '')
        ? 30_000
        : false,
  });
}

export const actKey = (orderId: string) => ['act', orderId] as const;

/** The reception act of an order: none until the workshop has sent it. */
export function useAct(orderId: string, enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: actKey(orderId),
    queryFn: () => api.call('client.act', { params: { id: orderId } }),
    enabled,
    refetchInterval: 15_000,
  });
}

/** The words for an error the client can act on; anything unknown is the generic one. */
export function errorText(t: Texts['client'], error: unknown): string {
  const code = error instanceof ApiRequestError ? error.code : 'internal';
  const known = t.errors as Record<string, string>;
  return known[code] ?? t.errors.generic;
}

export const pick = (lang: Lang, names: { uz: string; ru: string }): string =>
  lang === 'ru' ? names.ru : names.uz;

/** Monday = 1 … Sunday = 7, for a date written "2026-10-29". */
export function weekdayOfDate(date: string): number {
  const sundayFirst = new Date(`${date}T00:00:00Z`).getUTCDay();
  return ((sundayFirst + 6) % 7) + 1;
}
