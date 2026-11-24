import { formatMoney } from '@cs/shared/format';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useApi, useBootstrap } from '../../../bootstrap';
import { useLang, useT } from '../../../i18n';
import { useCart } from '../../../lib/cart';
import { errorText, pick } from '../../../lib/client-data';
import { Button } from '../../../ui/Button';
import { BottomBar, ScreenHeader, Skeleton } from '../../../ui/client-parts';
import { Notice } from '../../../ui/Notice';
import { Availability, ProductPhoto, Stepper, useShopCategories } from './parts';

/** T10: a product — its photos, price, availability and words, and "to the cart" (client PDF, p. 11). */
export function ProductScreen({
  productId,
  onBack,
  onCart,
}: {
  productId: string;
  onBack: () => void;
  onCart: () => void;
}) {
  const t = useT().client;
  const lang = useLang();
  const api = useApi();
  const workshop = useBootstrap().data?.workshop;
  const cart = useCart();
  const categories = useShopCategories();
  const product = useQuery({
    queryKey: ['shopProduct', productId],
    queryFn: () => api.call('client.shopProduct', { params: { id: productId } }),
  });
  const inCart = cart.qtyOf(productId);
  const [qty, setQty] = useState(1);

  const data = product.data;
  const name = data ? pick(lang, { uz: data.nameUz, ru: data.nameRu }) : '';
  const title = name;
  const category = categories.data?.items.find((candidate) => candidate.id === data?.categoryId);
  const description = data ? (lang === 'ru' ? data.descriptionRu : data.descriptionUz) : null;
  const room = data ? Math.max(0, data.maxQty - inCart) : 0;

  return (
    <section className="screen screen--with-bar">
      <ScreenHeader title={t.shop.title} onBack={onBack} />
      {product.isPending && <Skeleton rows={4} />}
      {product.isError && <Notice tone="danger">{errorText(t, product.error)}</Notice>}
      {data && (
        <>
          {data.photos.length > 0 ? (
            <div className="product-gallery">
              {data.photos.map((src, index) => (
                <img key={src} src={src} alt={`${title} (${index + 1})`} />
              ))}
            </div>
          ) : (
            <ProductPhoto src={null} alt={title} />
          )}
          <div className="form-stack">
            {category && (
              <span className="secondary">
                {pick(lang, { uz: category.nameUz, ru: category.nameRu })}
              </span>
            )}
            <h2 className="title-xl">{title}</h2>
            <div className="product-price">
              <span className="num price-lg">{formatMoney(data.price, lang)}</span>
              <Availability value={data.availability} />
            </div>
            {description && <p className="product-text">{description}</p>}
            <dl className="product-facts">
              {data.pack && (
                <>
                  <dt>{t.shop.pack}</dt>
                  <dd>{data.pack}</dd>
                </>
              )}
              {data.brand && (
                <>
                  <dt>{t.shop.brand}</dt>
                  <dd>{data.brand}</dd>
                </>
              )}
              <dt>{t.shop.sku}</dt>
              <dd>{data.sku}</dd>
              {workshop?.address && (
                <>
                  <dt>{t.shop.pickup}</dt>
                  <dd>{workshop.address}</dd>
                </>
              )}
            </dl>
            {inCart > 0 && (
              <Button variant="link" onClick={onCart}>
                {t.shop.inCart(inCart)}
              </Button>
            )}
          </div>
        </>
      )}
      {data && data.maxQty > 0 && (
        <BottomBar>
          {room > 0 ? (
            <div className="product-actions">
              <Stepper
                qty={Math.min(qty, room)}
                max={room}
                onChange={(next) => setQty(Math.max(1, next))}
                tone="light"
              />
              <Button
                onClick={() => {
                  cart.set(productId, inCart + Math.min(qty, room));
                  setQty(1);
                }}
              >
                {t.shop.toCart}
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={onCart}>
              {t.shop.maxReached}: {t.shop.inCart(inCart)}
            </Button>
          )}
        </BottomBar>
      )}
    </section>
  );
}
