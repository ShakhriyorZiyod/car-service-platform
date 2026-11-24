import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { useBack } from '../../../lib/back';
import { CartScreen } from './CartScreen';
import { CatalogScreen } from './CatalogScreen';
import { ProductScreen } from './ProductScreen';
import { SentScreen } from './SentScreen';
import './shop.css';

type View =
  | { kind: 'catalog' }
  | { kind: 'product'; productId: string }
  | { kind: 'cart' }
  | { kind: 'sent'; shopOrderId: string; number: number };

/**
 * The shop tab (docs/PLAN.md, stage 9; design T7, T10, T11): the catalog, a product, the cart and
 * "sent". Its own chunk: a client who never opens it never loads it. It handles Telegram's back
 * button itself: from the catalog to "Bosh", from anything else to the catalog.
 */
export default function ShopTab({
  tabBar,
  onExit,
  onOrders,
}: {
  /** The client's tab bar, shown under the catalog. */
  tabBar: ReactNode;
  onExit: () => void;
  onOrders: () => void;
}) {
  const [view, setView] = useState<View>({ kind: 'catalog' });
  const toCatalog = useCallback(() => setView({ kind: 'catalog' }), []);
  useBack(view.kind === 'catalog' ? onExit : toCatalog);

  switch (view.kind) {
    case 'catalog':
      return (
        <CatalogScreen
          tabBar={tabBar}
          onOpen={(productId) => setView({ kind: 'product', productId })}
          onCart={() => setView({ kind: 'cart' })}
        />
      );
    case 'product':
      return (
        <ProductScreen
          productId={view.productId}
          onBack={toCatalog}
          onCart={() => setView({ kind: 'cart' })}
        />
      );
    case 'cart':
      return (
        <CartScreen
          onBack={toCatalog}
          onSent={(shopOrderId, number) => setView({ kind: 'sent', shopOrderId, number })}
        />
      );
    case 'sent':
      return <SentScreen number={view.number} onOrders={onOrders} onShop={toCatalog} />;
  }
}
