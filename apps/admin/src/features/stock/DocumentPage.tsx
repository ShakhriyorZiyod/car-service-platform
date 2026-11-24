import type { Product, StockDocument } from '@cs/shared';
import { formatMoney, formatQty, parseQty } from '@cs/shared/format';
import { WRITE_OFF_REASONS, type WriteOffReason } from '@cs/shared/vocabulary';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Barcode, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiRequestError, call } from '../../api';
import { useCan } from '../../auth/session';
import { useLang, useT } from '../../i18n';
import { apiMessage, genericMessage } from '../../lib/errors';
import { PRODUCTS_KEY, STOCK_KEY, SUPPLIERS_KEY, stockDocumentKey } from '../../lib/keys';
import { newPhotoId } from '../../lib/photo';
import { Button } from '../../ui/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { Field } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { PhotoTile } from '../../ui/PhotoTile';
import { SelectField } from '../../ui/SelectField';
import './stock.css';

/** What is typed into a line: text, so a half-typed "12," stays as it is. */
interface LineDraft {
  productId: string;
  qty: string;
  unitCost: string;
}

interface HeaderDraft {
  supplierId: string;
  invoiceNo: string;
  invoiceDate: string;
  reason: WriteOffReason | '';
  note: string;
}

const headerOf = (document: StockDocument): HeaderDraft => ({
  supplierId: document.supplier?.id ?? '',
  invoiceNo: document.invoiceNo ?? '',
  invoiceDate: document.invoiceDate ?? '',
  reason: document.reason ?? '',
  note: document.note ?? '',
});

const linesOf = (document: StockDocument): LineDraft[] =>
  document.lines.map((line) => ({
    productId: line.productId,
    qty: String(line.qty).replace('.', ','),
    unitCost: line.unitCost === null ? '' : String(line.unitCost),
  }));

const digits = (text: string) => text.replace(/\D/g, '');

/** A warehouse document (design A11): a draft is edited here and posted; a posted one is read. */
export function DocumentPage() {
  const { id = '' } = useParams();
  const t = useT();
  const document = useQuery({
    queryKey: stockDocumentKey(id),
    queryFn: () => call('admin.stockDocument', { params: { id } }),
  });
  if (document.isPending) return <p className="muted">{t.form.loading}</p>;
  if (document.isError) return <Notice tone="danger">{genericMessage(document.error, t)}</Notice>;
  // Remounted only when the document is posted: a refetch must not wipe what is being typed, and
  // a refused post must keep its message on the screen.
  return <Editor key={`${document.data.id}:${document.data.status}`} document={document.data} />;
}

function Editor({ document }: { document: StockDocument }) {
  const t = useT();
  const lang = useLang();
  const can = useCan();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const writable = document.status === 'draft' && can('stock.write');
  const kind = document.kind;

  const [header, setHeader] = useState<HeaderDraft>(() => headerOf(document));
  const [lines, setLines] = useState<LineDraft[]>(() => linesOf(document));
  const [search, setSearch] = useState('');
  const [confirming, setConfirming] = useState<'post' | 'delete' | null>(null);

  const products = useQuery({ queryKey: PRODUCTS_KEY, queryFn: () => call('admin.products') });
  const suppliers = useQuery({
    queryKey: SUPPLIERS_KEY,
    queryFn: () => call('admin.suppliers'),
    enabled: kind === 'receipt',
  });
  const productOf = useMemo(
    () => new Map((products.data?.items ?? []).map((product) => [product.id, product])),
    [products.data],
  );

  const dirty =
    JSON.stringify(header) !== JSON.stringify(headerOf(document)) ||
    JSON.stringify(lines) !== JSON.stringify(linesOf(document));

  const body = () => ({
    supplierId: kind === 'receipt' && header.supplierId ? header.supplierId : null,
    invoiceNo: kind === 'receipt' && header.invoiceNo.trim() ? header.invoiceNo.trim() : null,
    invoiceDate: kind === 'receipt' && header.invoiceDate ? header.invoiceDate : null,
    reason: kind === 'write_off' && header.reason ? header.reason : null,
    note: header.note.trim() ? header.note.trim() : null,
    lines: lines.map((line) => ({
      productId: line.productId,
      qty: parseQty(line.qty) ?? -1,
      unitCost: kind === 'receipt' ? Number(digits(line.unitCost) || '-1') : null,
    })),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: STOCK_KEY });
  };
  const save = useMutation({
    mutationFn: () =>
      call('admin.updateStockDocument', { params: { id: document.id }, body: body() }),
    onSuccess: refresh,
  });
  const post = useMutation({
    mutationFn: async () => {
      // Unsaved changes are saved first: what is posted is what is on the screen.
      if (dirty) {
        await call('admin.updateStockDocument', { params: { id: document.id }, body: body() });
      }
      return call('admin.postStockDocument', { params: { id: document.id } });
    },
    onSuccess: async () => {
      setConfirming(null);
      await refresh();
    },
    onError: async () => {
      setConfirming(null);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => call('admin.deleteStockDocument', { params: { id: document.id } }),
    onSuccess: async () => {
      await refresh();
      void navigate('/stock?tab=documents');
    },
  });
  const photo = useMutation({
    mutationFn: (bytes: Uint8Array) =>
      call('admin.putStockInvoicePhoto', {
        params: { id: document.id, mediaId: newPhotoId() },
        body: bytes,
      }),
    onSuccess: refresh,
  });

  // The fields and lines the server named; a line is named by its index or, when short, its product.
  const failure = save.error ?? post.error;
  const paths = failure instanceof ApiRequestError ? failure.paths : [];
  const lineFailed = (index: number, field: string, productId: string) =>
    paths.includes(`body.lines.${index}.${field}`) || paths.includes(`lines.${productId}`);
  const headerFailed = (field: string) =>
    paths.includes(`body.${field}`) || paths.includes(`document.${field}`);

  const add = (product: Product) => {
    setSearch('');
    if (lines.some((line) => line.productId === product.id)) return;
    setLines([
      ...lines,
      {
        productId: product.id,
        qty: kind === 'inventory' ? String(product.stock.onHand).replace('.', ',') : '',
        unitCost:
          kind === 'receipt' && product.costs?.lastCost ? String(product.costs.lastCost) : '',
      },
    ]);
  };
  const patch = (index: number, change: Partial<LineDraft>) =>
    setLines(lines.map((line, i) => (i === index ? { ...line, ...change } : line)));

  const term = search.trim().toLowerCase();
  const matches =
    term === ''
      ? []
      : (products.data?.items ?? [])
          .filter((product) => product.isActive || kind !== 'receipt')
          .filter(
            (product) =>
              product.barcode === term ||
              product.sku.toLowerCase().includes(term) ||
              product.nameUz.toLowerCase().includes(term) ||
              product.nameRu.toLowerCase().includes(term),
          )
          .slice(0, 8);

  const kindName = t.stock.documentKinds[kind];
  const saved = new Map(document.lines.map((line) => [line.productId, line]));
  const total =
    kind === 'receipt'
      ? lines.reduce((sum, line) => {
          const qty = parseQty(line.qty);
          const cost = Number(digits(line.unitCost) || '0');
          return qty === null ? sum : sum + Math.floor(qty * cost + 0.5);
        }, 0)
      : null;
  const when = (instant: { date: string; time: string }) =>
    `${instant.date.slice(8)}.${instant.date.slice(5, 7)}.${instant.date.slice(0, 4)} ${instant.time}`;
  const nameOf = (item: { nameUz: string; nameRu: string }) =>
    lang === 'ru' ? item.nameRu : item.nameUz;

  return (
    <section className="stock-doc">
      <header className="stock-doc__head">
        <div className="stock-doc__title">
          <Link className="back-link" to="/stock?tab=documents" aria-label={t.stock.document.back}>
            <ArrowLeft size={18} aria-hidden="true" />
          </Link>
          <h1 className="page-title">{t.stock.documentTitle(kindName, document.number)}</h1>
          <span className={document.status === 'draft' ? 'chip chip--warning' : 'chip'}>
            {t.stock.statuses[document.status]}
          </span>
        </div>
        {writable && (
          <div className="stock__actions">
            <Button
              variant="ghost"
              icon={<Trash2 size={16} aria-hidden="true" />}
              onClick={() => setConfirming('delete')}
            >
              {t.stock.document.deleteDraft}
            </Button>
            <Button
              variant="secondary"
              busy={save.isPending}
              disabled={!dirty}
              onClick={() => save.mutate()}
            >
              {t.stock.document.save}
            </Button>
            <Button disabled={lines.length === 0} onClick={() => setConfirming('post')}>
              {t.stock.document.post[kind === 'sale' ? 'receipt' : kind]}
            </Button>
          </div>
        )}
      </header>

      {!writable && document.status === 'posted' && (
        <Notice tone="info">
          {t.stock.document.readOnly}{' '}
          {document.postedAt &&
            document.postedBy &&
            t.stock.document.postedBy(document.postedBy, when(document.postedAt))}
        </Notice>
      )}
      {failure !== null && (
        <Notice tone="danger">
          {failure instanceof ApiRequestError && failure.code === 'insufficient_stock'
            ? t.stock.document.short
            : apiMessage(failure, t)}
        </Notice>
      )}
      {save.isSuccess && !dirty && <Notice tone="success">{t.stock.document.saved}</Notice>}

      <section className="card stock-doc__header">
        {kind === 'receipt' && (
          <>
            <SelectField
              label={t.stock.document.supplier}
              value={header.supplierId}
              disabled={!writable}
              error={headerFailed('supplierId') ? t.errors.validation : null}
              onChange={(event) => setHeader({ ...header, supplierId: event.target.value })}
            >
              <option value="">{t.stock.document.chooseSupplier}</option>
              {(suppliers.data?.items ?? [])
                .filter((supplier) => supplier.isActive || supplier.id === header.supplierId)
                .map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
            </SelectField>
            <Field
              label={t.stock.document.invoiceNo}
              value={header.invoiceNo}
              maxLength={64}
              disabled={!writable}
              onChange={(event) => setHeader({ ...header, invoiceNo: event.target.value })}
            />
            <Field
              label={t.stock.document.invoiceDate}
              type="date"
              value={header.invoiceDate}
              disabled={!writable}
              onChange={(event) => setHeader({ ...header, invoiceDate: event.target.value })}
            />
            {(writable || document.invoicePhoto) && (
              <div className="stock-doc__photo">
                <PhotoTile
                  url={document.invoicePhoto?.url ?? null}
                  label={t.stock.document.invoicePhoto}
                  busy={photo.isPending}
                  disabled={!writable}
                  onPhoto={async (bytes) => {
                    await photo.mutateAsync(bytes);
                  }}
                />
              </div>
            )}
          </>
        )}
        {kind === 'write_off' && (
          <SelectField
            label={t.stock.document.reason}
            value={header.reason}
            disabled={!writable}
            error={headerFailed('reason') ? t.errors.validation : null}
            onChange={(event) =>
              setHeader({ ...header, reason: event.target.value as WriteOffReason | '' })
            }
          >
            <option value="">{t.stock.document.chooseReason}</option>
            {WRITE_OFF_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {t.stock.reasons[reason]}
              </option>
            ))}
          </SelectField>
        )}
        <Field
          label={t.stock.document.note}
          value={header.note}
          maxLength={300}
          disabled={!writable}
          onChange={(event) => setHeader({ ...header, note: event.target.value })}
        />
      </section>

      <div className="stock-doc__grid">
        <section className="card stock-doc__lines">
          {writable && (
            <div className="stock-doc__search">
              <label className="stock-doc__search-box">
                <Barcode size={18} aria-hidden="true" />
                <input
                  type="search"
                  placeholder={t.stock.document.findProduct}
                  value={search}
                  // A scanner types the code and presses Enter: an exact code adds the product.
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    const exact = (products.data?.items ?? []).find(
                      (product) => product.barcode === term || product.sku.toLowerCase() === term,
                    );
                    const pick = exact ?? (matches.length === 1 ? matches[0] : undefined);
                    if (pick) add(pick);
                  }}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              {term !== '' && (
                <ul className="picklist stock-doc__matches">
                  {matches.length === 0 && <li className="muted">{t.stock.document.noMatch}</li>}
                  {matches.map((product) => (
                    <li key={product.id}>
                      <button type="button" className="picklist__row" onClick={() => add(product)}>
                        <span>
                          <strong>{nameOf(product)}</strong>
                          <span className="muted stock__sub">{product.sku}</span>
                        </span>
                        <span className="muted num">
                          {formatQty(product.stock.onHand, product.unit, lang)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {lines.length === 0 ? (
            <p className="muted">{t.stock.document.noLines}</p>
          ) : (
            <table className="table stock-doc__table">
              <thead>
                <tr>
                  <th>{t.stock.document.columns.product}</th>
                  {kind === 'inventory' && (
                    <th className="table__num">{t.stock.document.columns.expected}</th>
                  )}
                  <th className="table__num">
                    {kind === 'inventory'
                      ? t.stock.document.columns.counted
                      : t.stock.document.columns.qty}
                  </th>
                  {kind === 'receipt' && (
                    <th className="table__num">{t.stock.document.columns.unitCost}</th>
                  )}
                  {kind === 'receipt' && (
                    <th className="table__num">{t.stock.document.columns.sum}</th>
                  )}
                  {writable && <th aria-label={t.stock.document.remove} />}
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const product = productOf.get(line.productId);
                  const fromServer = saved.get(line.productId);
                  const unit = product?.unit ?? fromServer?.unit ?? 'pcs';
                  const qty = parseQty(line.qty);
                  const cost = Number(digits(line.unitCost) || '0');
                  const expected = fromServer?.expectedQty ?? fromServer?.onHandNow ?? null;
                  return (
                    <tr
                      key={line.productId}
                      className={
                        lineFailed(index, 'qty', line.productId) ? 'stock-doc__row--bad' : undefined
                      }
                    >
                      <td>
                        <strong>
                          {product ? nameOf(product) : fromServer ? nameOf(fromServer) : ''}
                        </strong>
                        <span className="muted stock__sub">{product?.sku ?? fromServer?.sku}</span>
                      </td>
                      {kind === 'inventory' && (
                        <td className="table__num num muted">
                          {expected === null ? '' : formatQty(expected, unit, lang)}
                        </td>
                      )}
                      <td className="table__num">
                        {writable ? (
                          <input
                            className={
                              lineFailed(index, 'qty', line.productId)
                                ? 'field__input num stock-doc__input is-invalid'
                                : 'field__input num stock-doc__input'
                            }
                            inputMode="decimal"
                            aria-label={t.stock.document.columns.qty}
                            value={line.qty}
                            onChange={(event) => patch(index, { qty: event.target.value })}
                          />
                        ) : (
                          <span className="num">
                            {qty === null ? '' : formatQty(qty, unit, lang)}
                          </span>
                        )}
                      </td>
                      {kind === 'receipt' && (
                        <td className="table__num">
                          {writable ? (
                            <input
                              className={
                                lineFailed(index, 'unitCost', line.productId)
                                  ? 'field__input num stock-doc__input is-invalid'
                                  : 'field__input num stock-doc__input'
                              }
                              inputMode="numeric"
                              aria-label={t.stock.document.columns.unitCost}
                              value={line.unitCost === '' ? '' : formatMoneyDigits(line.unitCost)}
                              onChange={(event) =>
                                patch(index, { unitCost: digits(event.target.value).slice(0, 10) })
                              }
                            />
                          ) : (
                            <span className="num">{formatMoney(cost, lang)}</span>
                          )}
                        </td>
                      )}
                      {kind === 'receipt' && (
                        <td className="table__num num">
                          {qty === null ? '' : formatMoney(Math.floor(qty * cost + 0.5), lang)}
                        </td>
                      )}
                      {writable && (
                        <td className="table__num">
                          <Button
                            variant="ghost"
                            aria-label={t.stock.document.remove}
                            icon={<Trash2 size={16} aria-hidden="true" />}
                            onClick={() => setLines(lines.filter((_, i) => i !== index))}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <footer className="stock-doc__foot">
            <span className="muted">{t.stock.document.positions(lines.length)}</span>
            {total !== null && (
              <span className="section-title num">{formatMoney(total, lang)}</span>
            )}
          </footer>
        </section>

        {document.status === 'draft' && document.lines.length > 0 && (
          <aside className="card stock-doc__after">
            <h2 className="section-title">{t.stock.document.afterTitle}</h2>
            {dirty && <p className="muted">{t.stock.document.unsaved}</p>}
            <ul className="stock-doc__after-list">
              {document.lines.map((line) => (
                <li key={line.productId}>
                  <span>{nameOf(line)}</span>
                  <span className="num">
                    <span className="muted">
                      {line.onHandNow === null ? '' : formatQty(line.onHandNow, line.unit, lang)}
                    </span>
                    {' → '}
                    <strong
                      className={
                        line.onHandAfter !== null && line.onHandAfter < 0
                          ? 'stock-doc__negative'
                          : undefined
                      }
                    >
                      {line.onHandAfter === null
                        ? ''
                        : formatQty(line.onHandAfter, line.unit, lang)}
                    </strong>
                  </span>
                </li>
              ))}
            </ul>
            <p className="muted stock__note">{t.stock.document.afterNote}</p>
          </aside>
        )}
      </div>

      <p className="muted">
        {t.stock.document.createdBy(document.createdBy, when(document.createdAt))}
      </p>

      {confirming === 'post' && (
        <ConfirmDialog
          title={t.stock.document.postTitle}
          confirmLabel={t.stock.document.post[kind === 'sale' ? 'receipt' : kind]}
          pending={post.isPending}
          error={post.error}
          onConfirm={() => post.mutate()}
          onClose={() => setConfirming(null)}
        >
          <p>{t.stock.document.postText}</p>
        </ConfirmDialog>
      )}
      {confirming === 'delete' && (
        <ConfirmDialog
          title={t.stock.document.deleteTitle}
          confirmLabel={t.stock.document.deleteDraft}
          danger
          pending={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate()}
          onClose={() => setConfirming(null)}
        >
          <p>{t.stock.document.deleteText}</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

/** "145000" → "145 000" while typing a price. */
const formatMoneyDigits = (text: string) => text.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
