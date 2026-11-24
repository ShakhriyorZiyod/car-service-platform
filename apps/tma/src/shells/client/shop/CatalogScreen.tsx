import type { ShopProduct } from '@cs/shared';
import { formatMoney } from '@cs/shared/format';
import type { ShopSort } from '@cs/shared/vocabulary';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, ShoppingBag } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useApi } from '../../../bootstrap';
import { useLang, useT } from '../../../i18n';
import { useCart } from '../../../lib/cart';
import { errorText, pick } from '../../../lib/client-data';
import { BottomBar, EmptyState, Skeleton } from '../../../ui/client-parts';
import { Notice } from '../../../ui/Notice';
import { Availability, ProductPhoto, Stepper, useQuote, useShopCategories } from './parts';

/** T7: the catalog — search, the categories, the goods and the cart's bar (client PDF, p. 7). */
export function CatalogScreen({
  tabBar,
  onOpen,
  onCart,
}: {
  tabBar: ReactNode;
  onOpen: (productId: string) => void;
  onCart: () => void;
}) {
  const t = useT().client;
  const lang = useLang();
  const api = useApi();
  const cart = useCart();
  const quote = useQuote(cart.lines);
  const categories = useShopCategories();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [inStock, setInStock] = useState(false);
  const [sort, setSort] = useState<ShopSort>('popular');

  // The server searches a moment after the typing stops.
  useEffect(() => {
    const timer = setTimeout(() => setQ(typed.trim()), 300);
    return () => clearTimeout(timer);
  }, [typed]);

  const products = useQuery({
    queryKey: ['shopProducts', categoryId, q, inStock, sort],
    queryFn: () =>
      api.call('client.shopProducts', {
        query: {
          categoryId: categoryId ?? undefined,
          q: q || undefined,
          inStock: inStock ? 'true' : undefined,
          sort,
        },
      }),
    placeholderData: (previous) => previous,
  });

  const topLevel = (categories.data?.items ?? []).filter((category) => category.parentId === null);
  const filtered = categoryId !== null || q !== '' || inStock;
  const items = products.data?.items ?? [];

  return (
    <div className="client">
      <section className={cart.count > 0 ? 'screen screen--with-bar' : 'screen'}>
        <h1 className="title-xl">{t.shop.title}</h1>
        <label className="shop-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={typed}
            placeholder={t.shop.search}
            aria-label={t.shop.search}
            maxLength={60}
            onChange={(event) => setTyped(event.target.value)}
          />
        </label>
        {topLevel.length > 0 && (
          <div className="shop-chips" role="tablist">
            {[{ id: null, nameUz: t.shop.all, nameRu: t.shop.all }, ...topLevel].map((category) => (
              <button
                key={category.id ?? 'all'}
                type="button"
                role="tab"
                aria-selected={category.id === categoryId}
                className={category.id === categoryId ? 'chip-choice is-selected' : 'chip-choice'}
                onClick={() => setCategoryId(category.id)}
              >
                {pick(lang, { uz: category.nameUz, ru: category.nameRu })}
              </button>
            ))}
          </div>
        )}
        <div className="shop-filters">
          <label className="shop-check">
            <input
              type="checkbox"
              checked={inStock}
              onChange={(event) => setInStock(event.target.checked)}
            />
            {t.shop.inStockOnly}
          </label>
          <select
            className="shop-sort"
            value={sort}
            aria-label={t.shop.sort.popular}
            onChange={(event) => setSort(event.target.value as ShopSort)}
          >
            {(['popular', 'price_asc', 'price_desc'] as const).map((value) => (
              <option key={value} value={value}>
                {t.shop.sort[value]}
              </option>
            ))}
          </select>
        </div>

        {products.isPending && <Skeleton rows={4} />}
        {products.isError && <Notice tone="danger">{errorText(t, products.error)}</Notice>}
        {products.isSuccess && items.length === 0 && (
          <EmptyState
            icon={<ShoppingBag size={28} />}
            title={filtered ? t.shop.emptyTitle : t.shop.emptyShopTitle}
            text={filtered ? t.shop.emptyText : t.shop.emptyShopText}
          />
        )}
        <ul className="product-grid">
          {items.map((product) => (
            <li key={product.id}>
              <ProductTile
                product={product}
                qty={cart.qtyOf(product.id)}
                onOpen={() => onOpen(product.id)}
                onQty={(qty) => cart.set(product.id, qty)}
              />
            </li>
          ))}
        </ul>
      </section>

      <BottomBar
        summary={
          cart.count > 0 && (
            <button type="button" className="cart-bar" onClick={onCart}>
              <span>{t.shop.cartBar(cart.count)}</span>
              <span className="num">
                {quote.data ? formatMoney(quote.data.subtotal, lang) : ''}
              </span>
            </button>
          )
        }
      >
        {tabBar}
      </BottomBar>
    </div>
  );
}

function ProductTile({
  product,
  qty,
  onOpen,
  onQty,
}: {
  product: ShopProduct;
  qty: number;
  onOpen: () => void;
  onQty: (qty: number) => void;
}) {
  const t = useT().client.shop;
  const lang = useLang();
  const name = pick(lang, { uz: product.nameUz, ru: product.nameRu });
  const title = name;
  return (
    <article className="card product-tile">
      <button type="button" className="product-tile__open" onClick={onOpen}>
        <ProductPhoto src={product.photo} alt={title} />
        <span className="product-tile__name">{title}</span>
        <Availability value={product.availability} />
      </button>
      <span className="num product-tile__price">{formatMoney(product.price, lang)}</span>
      {product.maxQty > 0 &&
        (qty > 0 ? (
          <Stepper qty={qty} max={product.maxQty} onChange={onQty} />
        ) : (
          <button
            type="button"
            className="add-button"
            aria-label={`${t.add}: ${title}`}
            onClick={() => onQty(1)}
          >
            <Plus size={20} aria-hidden="true" />
            <span>{t.add}</span>
          </button>
        ))}
    </article>
  );
}
