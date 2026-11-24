import type { Product, ProductCategory } from '@cs/shared';
import { formatMoney, formatQty, parseQty, UNIT_LABELS } from '@cs/shared/format';
import { LIMITS, PRODUCT_UNITS, type ProductUnit } from '@cs/shared/vocabulary';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { call } from '../../api';
import { useLang, useT } from '../../i18n';
import { apiMessage, genericMessage, invalidFields } from '../../lib/errors';
import { PRODUCT_CATEGORIES_KEY, PRODUCTS_KEY, STOCK_KEY } from '../../lib/keys';
import { newPhotoId } from '../../lib/photo';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { PhotoTile } from '../../ui/PhotoTile';
import { SelectField } from '../../ui/SelectField';

/** "Mahsulotlar" (stage 8): the shop's categories and the product cards (PLAN 7.14, 8). */
export function ProductsTab() {
  const t = useT();
  const lang = useLang();
  const categories = useQuery({
    queryKey: PRODUCT_CATEGORIES_KEY,
    queryFn: () => call('admin.productCategories'),
  });
  const products = useQuery({ queryKey: PRODUCTS_KEY, queryFn: () => call('admin.products') });
  const [categoryForm, setCategoryForm] = useState<string | null>(null);
  const [productForm, setProductForm] = useState<string | null>(null);

  const allCategories = categories.data?.items ?? [];
  const nameOf = (item: { nameUz: string; nameRu: string }) =>
    lang === 'ru' ? item.nameRu : item.nameUz;
  const categoryName = (id: string) => {
    const category = allCategories.find((item) => item.id === id);
    if (!category) return '';
    const parent = allCategories.find((item) => item.id === category.parentId);
    return parent ? `${nameOf(parent)} → ${nameOf(category)}` : nameOf(category);
  };

  if (categories.isError)
    return <Notice tone="danger">{genericMessage(categories.error, t)}</Notice>;
  if (products.isError) return <Notice tone="danger">{genericMessage(products.error, t)}</Notice>;

  const tops = allCategories.filter((item) => item.parentId === null);
  const items = products.data?.items ?? [];

  return (
    <div className="products-tab">
      <section className="card form-stack products-tab__categories">
        <header className="products-tab__head">
          <h2 className="section-title">{t.stock.products.categories}</h2>
          <Button
            variant="ghost"
            icon={<Plus size={16} aria-hidden="true" />}
            onClick={() => setCategoryForm('new')}
          >
            {t.stock.products.addCategory}
          </Button>
        </header>
        {categories.isSuccess && tops.length === 0 && (
          <p className="muted">{t.stock.products.noCategories}</p>
        )}
        <ul className="products-tab__tree">
          {tops.map((top) => (
            <li key={top.id}>
              <CategoryLink category={top} onOpen={() => setCategoryForm(top.id)} />
              <ul>
                {allCategories
                  .filter((child) => child.parentId === top.id)
                  .map((child) => (
                    <li key={child.id}>
                      <CategoryLink category={child} onOpen={() => setCategoryForm(child.id)} />
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section className="card products-tab__products">
        <header className="products-tab__head">
          <h2 className="section-title">{t.stock.products.title}</h2>
          <Button
            icon={<Plus size={16} aria-hidden="true" />}
            disabled={allCategories.length === 0}
            onClick={() => setProductForm('new')}
          >
            {t.stock.products.add}
          </Button>
        </header>
        {products.isSuccess && items.length === 0 && (
          <p className="muted">{t.stock.products.empty}</p>
        )}
        {items.length > 0 && (
          <div className="products-tab__scroll">
            <table className="table table--rows">
              <thead>
                <tr>
                  <th>{t.stock.products.columns.product}</th>
                  <th>{t.stock.products.columns.category}</th>
                  <th className="table__num">{t.stock.products.columns.price}</th>
                  <th className="table__num">{t.stock.products.columns.stock}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((product) => (
                  <tr key={product.id} className={product.isActive ? undefined : 'is-hidden'}>
                    <td>
                      <button
                        type="button"
                        className="table__link products-tab__link"
                        onClick={() => setProductForm(product.id)}
                      >
                        {nameOf(product)}
                      </button>
                      <span className="muted products-tab__sub">
                        {product.sku}
                        {product.pack && `, ${product.pack}`}
                        {!product.isActive && `, ${t.stock.hidden}`}
                      </span>
                    </td>
                    <td className="muted">{categoryName(product.categoryId)}</td>
                    <td className="table__num num">
                      {product.sellPrice === null
                        ? t.common.none
                        : formatMoney(product.sellPrice, lang)}
                    </td>
                    <td className="table__num num">
                      {formatQty(product.stock.onHand, product.unit, lang)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {categoryForm && (
        <CategoryDialog
          category={
            categoryForm === 'new'
              ? null
              : (allCategories.find((item) => item.id === categoryForm) ?? null)
          }
          tops={tops}
          onClose={() => setCategoryForm(null)}
        />
      )}
      {productForm && (
        <ProductDialog
          productId={productForm === 'new' ? null : productForm}
          categories={allCategories}
          categoryName={categoryName}
          onClose={() => setProductForm(null)}
        />
      )}
    </div>
  );
}

function CategoryLink({ category, onOpen }: { category: ProductCategory; onOpen: () => void }) {
  const t = useT();
  const lang = useLang();
  return (
    <button type="button" className="table__link products-tab__link" onClick={onOpen}>
      {lang === 'ru' ? category.nameRu : category.nameUz}
      {!category.isActive && <span className="muted"> ({t.stock.hidden})</span>}
    </button>
  );
}

function CategoryDialog({
  category,
  tops,
  onClose,
}: {
  category: ProductCategory | null;
  tops: readonly ProductCategory[];
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const queryClient = useQueryClient();
  const [nameUz, setNameUz] = useState(category?.nameUz ?? '');
  const [nameRu, setNameRu] = useState(category?.nameRu ?? '');
  const [parentId, setParentId] = useState(category?.parentId ?? '');
  const [hidden, setHidden] = useState(category ? !category.isActive : false);

  const save = useMutation({
    mutationFn: () =>
      category
        ? call('admin.updateProductCategory', {
            params: { id: category.id },
            body: { nameUz, nameRu, isActive: !hidden },
          })
        : call('admin.createProductCategory', {
            body: { nameUz, nameRu, parentId: parentId || null },
          }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PRODUCT_CATEGORIES_KEY });
      onClose();
    },
  });
  const invalid = invalidFields(save.error);

  return (
    <Dialog
      title={category ? t.stock.products.editCategory : t.stock.products.addCategory}
      onClose={onClose}
    >
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <div className="form-row">
          <Field
            label={t.form.nameUz}
            value={nameUz}
            required
            maxLength={LIMITS.name.max}
            error={invalid.has('nameUz') ? t.errors.validation : null}
            onChange={(event) => setNameUz(event.target.value)}
          />
          <Field
            label={t.form.nameRu}
            value={nameRu}
            required
            maxLength={LIMITS.name.max}
            error={invalid.has('nameRu') ? t.errors.validation : null}
            onChange={(event) => setNameRu(event.target.value)}
          />
        </div>
        {!category && (
          <SelectField
            label={t.stock.products.parent}
            value={parentId}
            error={invalid.has('parentId') ? t.errors.validation : null}
            onChange={(event) => setParentId(event.target.value)}
          >
            <option value="">{t.stock.products.topLevel}</option>
            {tops.map((top) => (
              <option key={top.id} value={top.id}>
                {lang === 'ru' ? top.nameRu : top.nameUz}
              </option>
            ))}
          </SelectField>
        )}
        {category && (
          <label className="check">
            <input
              type="checkbox"
              checked={hidden}
              onChange={(event) => setHidden(event.target.checked)}
            />
            <span className="check__text">
              {t.form.hidden}
              <span className="muted">{t.form.hideHint}</span>
            </span>
          </label>
        )}
        {save.isError && <Notice tone="danger">{apiMessage(save.error, t)}</Notice>}
        <div className="dialog__actions">
          <Button variant="secondary" onClick={onClose}>
            {t.form.cancel}
          </Button>
          <Button type="submit" busy={save.isPending} disabled={!nameUz.trim() || !nameRu.trim()}>
            {t.form.save}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

interface ProductDraft {
  sku: string;
  barcode: string;
  nameUz: string;
  nameRu: string;
  descriptionUz: string;
  descriptionRu: string;
  categoryId: string;
  brand: string;
  unit: ProductUnit;
  pack: string;
  isForSale: boolean;
  isConsumable: boolean;
  sellPrice: string;
  minQty: string;
  isActive: boolean;
}

const draftOf = (product: Product | null, categoryId: string): ProductDraft => ({
  sku: product?.sku ?? '',
  barcode: product?.barcode ?? '',
  nameUz: product?.nameUz ?? '',
  nameRu: product?.nameRu ?? '',
  descriptionUz: product?.descriptionUz ?? '',
  descriptionRu: product?.descriptionRu ?? '',
  categoryId: product?.categoryId ?? categoryId,
  brand: product?.brand ?? '',
  unit: product?.unit ?? 'pcs',
  pack: product?.pack ?? '',
  isForSale: product?.isForSale ?? true,
  isConsumable: product?.isConsumable ?? false,
  sellPrice: product?.sellPrice === null || !product ? '' : String(product.sellPrice),
  minQty: product ? String(product.minQty).replace('.', ',') : '0',
  isActive: product?.isActive ?? true,
});

const orNull = (text: string) => (text.trim() === '' ? null : text.trim());

function ProductDialog({
  productId,
  categories,
  categoryName,
  onClose,
}: {
  productId: string | null;
  categories: readonly ProductCategory[];
  categoryName: (id: string) => string;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const queryClient = useQueryClient();
  const products = useQuery({ queryKey: PRODUCTS_KEY, queryFn: () => call('admin.products') });
  const product = products.data?.items.find((item) => item.id === productId) ?? null;
  const [draft, setDraft] = useState<ProductDraft>(() =>
    draftOf(product, categories.find((item) => item.isActive)?.id ?? ''),
  );
  const set = (change: Partial<ProductDraft>) => setDraft({ ...draft, ...change });

  const refresh = () => queryClient.invalidateQueries({ queryKey: STOCK_KEY });
  const save = useMutation({
    mutationFn: () => {
      const body = {
        sku: draft.sku.trim(),
        barcode: orNull(draft.barcode),
        nameUz: draft.nameUz,
        nameRu: draft.nameRu,
        descriptionUz: orNull(draft.descriptionUz),
        descriptionRu: orNull(draft.descriptionRu),
        categoryId: draft.categoryId,
        brand: orNull(draft.brand),
        unit: draft.unit,
        pack: orNull(draft.pack),
        isForSale: draft.isForSale,
        isConsumable: draft.isConsumable,
        sellPrice: draft.sellPrice === '' ? null : Number(draft.sellPrice),
        minQty: parseQty(draft.minQty) ?? -1,
      };
      return product
        ? call('admin.updateProduct', {
            params: { id: product.id },
            body: { ...body, isActive: draft.isActive },
          })
        : call('admin.createProduct', { body });
    },
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  const addPhoto = useMutation({
    mutationFn: (bytes: Uint8Array) =>
      call('admin.putProductPhoto', {
        params: { id: productId ?? '', mediaId: newPhotoId() },
        body: bytes,
      }),
    onSuccess: refresh,
  });
  const removePhoto = useMutation({
    mutationFn: (mediaId: string) =>
      call('admin.deleteProductPhoto', { params: { id: productId ?? '', mediaId } }),
    onSuccess: refresh,
  });

  const invalid = invalidFields(save.error);
  const error = (field: string) => (invalid.has(field) ? t.errors.validation : null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };
  const photos = product?.photos ?? [];

  return (
    <Dialog title={product ? t.stock.products.edit : t.stock.products.add} wide onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <div className="form-row">
          <Field
            label={t.form.nameUz}
            value={draft.nameUz}
            required
            maxLength={LIMITS.name.max}
            error={error('nameUz')}
            onChange={(event) => set({ nameUz: event.target.value })}
          />
          <Field
            label={t.form.nameRu}
            value={draft.nameRu}
            required
            maxLength={LIMITS.name.max}
            error={error('nameRu')}
            onChange={(event) => set({ nameRu: event.target.value })}
          />
        </div>
        <div className="form-row">
          <Field
            label={t.stock.products.fields.sku}
            value={draft.sku}
            required
            maxLength={LIMITS.sku.max}
            error={error('sku')}
            onChange={(event) => set({ sku: event.target.value })}
          />
          <Field
            label={t.stock.products.fields.barcode}
            inputMode="numeric"
            value={draft.barcode}
            maxLength={LIMITS.barcode.max}
            hint={t.stock.products.fields.barcodeHint}
            error={error('barcode')}
            onChange={(event) => set({ barcode: event.target.value.replace(/\D/g, '') })}
          />
        </div>
        <div className="form-row">
          <SelectField
            label={t.stock.products.fields.category}
            value={draft.categoryId}
            error={error('categoryId')}
            onChange={(event) => set({ categoryId: event.target.value })}
          >
            {categories
              .filter((item) => item.isActive || item.id === draft.categoryId)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {categoryName(item.id)}
                </option>
              ))}
          </SelectField>
          <Field
            label={t.stock.products.fields.brand}
            value={draft.brand}
            maxLength={LIMITS.brand.max}
            onChange={(event) => set({ brand: event.target.value })}
          />
        </div>
        <div className="products-tab__checks">
          <label className="check">
            <input
              type="checkbox"
              checked={draft.isForSale}
              onChange={(event) =>
                set({
                  isForSale: event.target.checked,
                  ...(event.target.checked && { unit: 'pcs' }),
                })
              }
            />
            <span className="check__text">{t.stock.products.fields.forSale}</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.isConsumable}
              onChange={(event) => set({ isConsumable: event.target.checked })}
            />
            <span className="check__text">{t.stock.products.fields.consumable}</span>
          </label>
        </div>
        {invalid.has('isForSale') && <p className="field__error">{t.errors.validation}</p>}
        <div className="form-row">
          <SelectField
            label={t.stock.products.fields.unit}
            value={draft.unit}
            disabled={draft.isForSale}
            hint={
              draft.isForSale
                ? t.stock.products.fields.unitHint
                : t.stock.products.fields.unitLocked
            }
            error={error('unit')}
            onChange={(event) => set({ unit: event.target.value as ProductUnit })}
          >
            {PRODUCT_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {UNIT_LABELS[lang][unit]}
              </option>
            ))}
          </SelectField>
          <Field
            label={t.stock.products.fields.pack}
            value={draft.pack}
            maxLength={LIMITS.pack.max}
            hint={t.stock.products.fields.packHint}
            onChange={(event) => set({ pack: event.target.value })}
          />
        </div>
        <div className="form-row">
          <Field
            label={t.stock.products.fields.sellPrice}
            inputMode="numeric"
            value={draft.sellPrice.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
            disabled={!draft.isForSale}
            error={error('sellPrice')}
            onChange={(event) =>
              set({ sellPrice: event.target.value.replace(/\D/g, '').slice(0, 10) })
            }
          />
          <Field
            label={t.stock.products.fields.minQty}
            inputMode="decimal"
            value={draft.minQty}
            hint={t.stock.products.fields.minQtyHint}
            error={error('minQty')}
            onChange={(event) => set({ minQty: event.target.value })}
          />
        </div>
        <div className="form-row">
          <label className="field">
            <span className="field__label">{t.stock.products.fields.descriptionUz}</span>
            <textarea
              className="field__input"
              rows={3}
              maxLength={LIMITS.description.max}
              value={draft.descriptionUz}
              onChange={(event) => set({ descriptionUz: event.target.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">{t.stock.products.fields.descriptionRu}</span>
            <textarea
              className="field__input"
              rows={3}
              maxLength={LIMITS.description.max}
              value={draft.descriptionRu}
              onChange={(event) => set({ descriptionRu: event.target.value })}
            />
          </label>
        </div>

        <fieldset className="form-stack products-tab__photos">
          <legend className="field__label">{t.stock.products.photos}</legend>
          {!product ? (
            <p className="muted">{t.stock.products.photosAfterSave}</p>
          ) : (
            <div className="products-tab__photo-grid">
              {photos.map((photo, index) => (
                <div key={photo.mediaId} className="products-tab__photo">
                  <img src={photo.url} alt={t.stock.products.photo(index + 1)} loading="lazy" />
                  <button
                    type="button"
                    className="products-tab__photo-remove"
                    aria-label={t.stock.products.removePhoto}
                    disabled={removePhoto.isPending}
                    onClick={() => removePhoto.mutate(photo.mediaId)}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              ))}
              {photos.length < LIMITS.productPhotos.max && (
                <PhotoTile
                  url={null}
                  label={t.stock.products.photo(photos.length + 1)}
                  busy={addPhoto.isPending}
                  onPhoto={async (bytes) => {
                    await addPhoto.mutateAsync(bytes);
                  }}
                />
              )}
            </div>
          )}
          {(addPhoto.isError || removePhoto.isError) && (
            <Notice tone="danger">{apiMessage(addPhoto.error ?? removePhoto.error, t)}</Notice>
          )}
        </fieldset>

        {product && (
          <label className="check">
            <input
              type="checkbox"
              checked={!draft.isActive}
              onChange={(event) => set({ isActive: !event.target.checked })}
            />
            <span className="check__text">
              {t.form.hidden}
              <span className="muted">{t.form.hideHint}</span>
            </span>
          </label>
        )}

        {save.isError && <Notice tone="danger">{apiMessage(save.error, t)}</Notice>}
        <div className="dialog__actions">
          <Button variant="secondary" onClick={onClose}>
            {t.form.cancel}
          </Button>
          <Button type="submit" busy={save.isPending}>
            {t.form.save}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
