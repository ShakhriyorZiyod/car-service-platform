import type { ProductAvailability } from '@cs/shared/vocabulary';
import { useQuery } from '@tanstack/react-query';
import { Minus, Package, Plus } from 'lucide-react';
import { useApi } from '../../../bootstrap';
import { useT } from '../../../i18n';
import type { CartLine } from '../../../lib/cart';

/** Pieces the shop's screens share. */

export const SHOP_CATEGORIES_KEY = ['shopCategories'] as const;

export function useShopCategories() {
  const api = useApi();
  return useQuery({
    queryKey: SHOP_CATEGORIES_KEY,
    queryFn: () => api.call('client.shopCategories'),
    staleTime: 5 * 60_000,
  });
}

/** The cart priced by the server: prices, totals and what keeps it from being ordered. */
export function useQuote(lines: readonly CartLine[]) {
  const api = useApi();
  return useQuery({
    queryKey: ['shopQuote', lines],
    queryFn: () => api.call('client.shopQuote', { body: { items: [...lines] } }),
    enabled: lines.length > 0,
    placeholderData: (previous) => previous,
  });
}

export function Availability({ value }: { value: ProductAvailability }) {
  const t = useT().client.shop.availability;
  return (
    <span className={`avail avail--${value}`}>
      <span className="avail__dot" aria-hidden="true" />
      {t[value]}
    </span>
  );
}

export function ProductPhoto({ src, alt, size }: { src: string | null; alt: string; size?: 'sm' }) {
  const t = useT().client.shop;
  return (
    <span className={size === 'sm' ? 'product-photo product-photo--sm' : 'product-photo'}>
      {src ? (
        <img src={src} alt={alt} loading="lazy" />
      ) : (
        <span className="product-photo__none" role="img" aria-label={t.noPhoto}>
          <Package size={size === 'sm' ? 20 : 40} aria-hidden="true" />
        </span>
      )}
    </span>
  );
}

/** − n +, the buttons at least 44 px (DESIGN 5). */
export function Stepper({
  qty,
  max,
  onChange,
  tone = 'ink',
}: {
  qty: number;
  max: number;
  onChange: (qty: number) => void;
  tone?: 'ink' | 'light';
}) {
  const t = useT().client.shop;
  return (
    <span className={`stepper stepper--${tone}`}>
      <button type="button" aria-label={t.less} onClick={() => onChange(qty - 1)}>
        <Minus size={18} aria-hidden="true" />
      </button>
      <span className="num stepper__qty" aria-live="polite">
        {qty}
      </span>
      <button
        type="button"
        aria-label={t.more}
        disabled={qty >= max}
        onClick={() => onChange(qty + 1)}
      >
        <Plus size={18} aria-hidden="true" />
      </button>
    </span>
  );
}
