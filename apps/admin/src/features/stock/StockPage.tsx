import type { StockRow } from '@cs/shared';
import { formatMoney, formatQty, formatQtyNumber, phoneInputState } from '@cs/shared/format';
import {
  STOCK_DOCUMENT_KINDS,
  STOCK_FILTERS,
  type ManualDocumentKind,
  type StockDocumentKind,
  type StockFilter,
} from '@cs/shared/vocabulary';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { call } from '../../api';
import { useCan } from '../../auth/session';
import { useLang, useT } from '../../i18n';
import { apiMessage, genericMessage, invalidFields } from '../../lib/errors';
import { STOCK_KEY, SUPPLIERS_KEY } from '../../lib/keys';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { PhoneField, phoneFieldText } from '../../ui/PhoneField';
import './stock.css';

const TABS = ['levels', 'documents', 'journal', 'suppliers'] as const;
type Tab = (typeof TABS)[number];

/** "Ombor" (design A5): the stock, the documents, the journal of movements and the suppliers. */
export function StockPage() {
  const t = useT();
  const can = useCan();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '')
    ? (params.get('tab') as Tab)
    : 'levels';

  const open = (next: Tab) => {
    const search = new URLSearchParams();
    if (next !== 'levels') search.set('tab', next);
    setParams(search, { replace: true });
  };

  // A new document starts as an empty draft and opens at once.
  const start = useMutation({
    mutationFn: (kind: ManualDocumentKind) =>
      call('admin.createStockDocument', {
        body: {
          kind,
          supplierId: null,
          invoiceNo: null,
          invoiceDate: null,
          reason: null,
          note: null,
          lines: [],
        },
      }),
    onSuccess: async (document) => {
      await queryClient.invalidateQueries({ queryKey: STOCK_KEY });
      void navigate(`/stock/documents/${document.id}`);
    },
  });

  return (
    <section className="stock">
      <header className="stock__head">
        <div className="stock__title">
          <h1 className="page-title">{t.stock.title}</h1>
          <nav className="pills" aria-label={t.stock.title}>
            {TABS.map((name) => (
              <button
                key={name}
                type="button"
                className={tab === name ? 'pill is-active' : 'pill'}
                onClick={() => open(name)}
              >
                {t.stock.tabs[name]}
              </button>
            ))}
          </nav>
        </div>
        {can('stock.write') && (
          <div className="stock__actions">
            {(['inventory', 'write_off'] as const).map((kind) => (
              <Button
                key={kind}
                variant="secondary"
                busy={start.isPending && start.variables === kind}
                onClick={() => start.mutate(kind)}
              >
                {t.stock.actions[kind]}
              </Button>
            ))}
            <Button
              icon={<Plus size={16} aria-hidden="true" />}
              busy={start.isPending && start.variables === 'receipt'}
              onClick={() => start.mutate('receipt')}
            >
              {t.stock.actions.receipt}
            </Button>
          </div>
        )}
      </header>
      {start.isError && <Notice tone="danger">{apiMessage(start.error, t)}</Notice>}

      {tab === 'levels' && <LevelsTab />}
      {tab === 'documents' && <DocumentsTab />}
      {tab === 'journal' && <JournalTab />}
      {tab === 'suppliers' && <SuppliersTab />}
    </section>
  );
}

/** The kind as the design writes it: for sale, a consumable, or both. */
function useKindOf() {
  const t = useT();
  return (row: Pick<StockRow, 'isForSale' | 'isConsumable'>) =>
    row.isForSale && row.isConsumable
      ? t.stock.kinds.both
      : row.isForSale
        ? t.stock.kinds.sale
        : t.stock.kinds.consumable;
}

function LevelsTab() {
  const t = useT();
  const lang = useLang();
  const kindOf = useKindOf();
  const [params, setParams] = useSearchParams();
  const filter = (STOCK_FILTERS as readonly string[]).includes(params.get('filter') ?? '')
    ? (params.get('filter') as StockFilter)
    : 'all';
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const list = useQuery({
    queryKey: [...STOCK_KEY, 'levels', filter, query],
    queryFn: () => call('admin.stock', { query: { filter, ...(query && { q: query }) } }),
  });
  const low = useQuery({
    queryKey: [...STOCK_KEY, 'low'],
    queryFn: () => call('admin.lowStock'),
  });

  const pick = (value: StockFilter) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('filter');
    else next.set('filter', value);
    setParams(next, { replace: true });
  };

  const rows = list.data?.items ?? [];
  const seesCosts = rows.some((row) => row.costs !== null);
  const value = rows.reduce((sum, row) => sum + (row.costs?.value ?? 0), 0);
  const nameOf = (row: { nameUz: string; nameRu: string }) =>
    lang === 'ru' ? row.nameRu : row.nameUz;

  return (
    <div className="stock__grid">
      <div className="stock__main">
        <div className="stock__tools">
          <label className="topbar__search stock__search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              placeholder={t.stock.searchPlaceholder}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <div className="pills">
            {STOCK_FILTERS.map((name) => (
              <button
                key={name}
                type="button"
                className={[
                  'pill',
                  filter === name && 'is-active',
                  name === 'low' && 'stock__pill-low',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => pick(name)}
              >
                {t.stock.filters[name]}
                {name === 'low' && low.data ? `: ${low.data.items.length}` : ''}
              </button>
            ))}
          </div>
        </div>

        {list.isError && <Notice tone="danger">{genericMessage(list.error, t)}</Notice>}
        {list.isSuccess && rows.length === 0 && (
          <p className="muted">{filter === 'all' && !query ? t.stock.noProducts : t.stock.empty}</p>
        )}
        {rows.length > 0 && (
          <section className="card stock__table-card">
            <table className="table table--rows stock__table">
              <thead>
                <tr>
                  <th>{t.stock.columns.product}</th>
                  <th>{t.stock.columns.kind}</th>
                  <th className="table__num">{t.stock.columns.onHand}</th>
                  <th className="table__num">{t.stock.columns.reserved}</th>
                  <th className="table__num">{t.stock.columns.free}</th>
                  <th className="table__num">{t.stock.columns.min}</th>
                  <th>{t.stock.columns.state}</th>
                  {seesCosts && <th className="table__num">{t.stock.columns.avgCost}</th>}
                  {seesCosts && <th className="table__num">{t.stock.columns.value}</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.productId} className={`stock__row--${row.stock.state}`}>
                    <td>
                      <Link
                        className="table__link"
                        to={`/stock?tab=journal&product=${row.productId}`}
                      >
                        {nameOf(row)}
                      </Link>
                      <span className="muted stock__sub">
                        {row.sku}, {lang === 'ru' ? row.categoryNameRu : row.categoryNameUz}
                        {!row.isActive && `, ${t.stock.hidden}`}
                      </span>
                    </td>
                    <td className="muted">{kindOf(row)}</td>
                    <td className="table__num num">
                      <strong>{formatQty(row.stock.onHand, row.unit, lang)}</strong>
                    </td>
                    <td className="table__num num muted">{formatQtyNumber(row.stock.reserved)}</td>
                    <td className="table__num num">
                      <strong>{formatQty(row.stock.free, row.unit, lang)}</strong>
                    </td>
                    <td className="table__num num muted">
                      {formatQty(row.minQty, row.unit, lang)}
                    </td>
                    <td>
                      <StateChip state={row.stock.state} />
                    </td>
                    {seesCosts && (
                      <td className="table__num num muted">
                        {row.costs ? formatMoney(row.costs.avgCost, lang) : ''}
                      </td>
                    )}
                    {seesCosts && (
                      <td className="table__num num">
                        {row.costs ? formatMoney(row.costs.value, lang) : ''}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {seesCosts && (
              <p className="stock__total num">{t.stock.totalValue(formatMoney(value, lang))}</p>
            )}
          </section>
        )}
      </div>
      <RecentMoves />
    </div>
  );
}

export function StateChip({ state }: { state: 'ok' | 'low' | 'out' }) {
  const t = useT();
  const tone =
    state === 'out' ? 'chip--danger' : state === 'low' ? 'chip--warning' : 'chip--success';
  return <span className={`chip ${tone}`}>{t.stock.states[state]}</span>;
}

/** The right column of A5: the latest movements, newest first. */
function RecentMoves() {
  const t = useT();
  const lang = useLang();
  const moves = useQuery({
    queryKey: [...STOCK_KEY, 'journal', 'recent'],
    queryFn: () => call('admin.stockMovements', { query: { limit: 8 } }),
  });
  const items = moves.data?.items ?? [];
  return (
    <aside className="card stock__side">
      <h2 className="section-title">{t.stock.todayTitle}</h2>
      {moves.isSuccess && items.length === 0 && <p className="muted">{t.stock.todayEmpty}</p>}
      <ul className="stock__moves">
        {items.map((move) => (
          <li key={move.id} className="stock__move">
            <span
              className={move.delta > 0 ? 'stock__move-sign is-in' : 'stock__move-sign is-out'}
              aria-hidden="true"
            >
              {move.delta > 0 ? '+' : '−'}
            </span>
            <span>
              <Link className="table__link" to={`/stock/documents/${move.document.id}`}>
                {t.stock.documentTitle(
                  t.stock.documentKinds[move.document.kind],
                  move.document.number,
                )}
              </Link>
              <span className="muted stock__sub">
                {lang === 'ru' ? move.nameRu : move.nameUz}:{' '}
                {formatQty(Math.abs(move.delta), move.unit, lang)}, {move.at.date.slice(8)}.
                {move.at.date.slice(5, 7)} {move.at.time}
                {move.actorName && `, ${move.actorName}`}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="muted stock__note">{t.stock.todayNote}</p>
    </aside>
  );
}

function DocumentsTab() {
  const t = useT();
  const lang = useLang();
  const [kind, setKind] = useState<StockDocumentKind | null>(null);
  const list = useInfiniteQuery({
    queryKey: [...STOCK_KEY, 'documents', kind],
    queryFn: ({ pageParam }) =>
      call('admin.stockDocuments', {
        query: { limit: 30, ...(kind && { kind }), ...(pageParam && { cursor: pageParam }) },
      }),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div className="stock__main">
      <div className="pills">
        <button
          type="button"
          className={kind === null ? 'pill is-active' : 'pill'}
          onClick={() => setKind(null)}
        >
          {t.stock.documents.all}
        </button>
        {STOCK_DOCUMENT_KINDS.map((name) => (
          <button
            key={name}
            type="button"
            className={kind === name ? 'pill is-active' : 'pill'}
            onClick={() => setKind(name)}
          >
            {t.stock.documentKinds[name]}
          </button>
        ))}
      </div>
      {list.isError && <Notice tone="danger">{genericMessage(list.error, t)}</Notice>}
      {list.isSuccess && rows.length === 0 && <p className="muted">{t.stock.documents.empty}</p>}
      {rows.length > 0 && (
        <section className="card stock__table-card">
          <table className="table table--rows">
            <thead>
              <tr>
                <th>{t.stock.documents.columns.number}</th>
                <th>{t.stock.documents.columns.detail}</th>
                <th className="table__num">{t.stock.documents.columns.lines}</th>
                <th className="table__num">{t.stock.documents.columns.total}</th>
                <th>{t.stock.documents.columns.created}</th>
                <th>{t.stock.documents.columns.status}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((document) => (
                <tr key={document.id}>
                  <td>
                    <Link className="table__link" to={`/stock/documents/${document.id}`}>
                      {t.stock.documentTitle(t.stock.documentKinds[document.kind], document.number)}
                    </Link>
                  </td>
                  <td className="muted">
                    {document.supplier
                      ? `${document.supplier.name}${document.invoiceNo ? `, ${document.invoiceNo}` : ''}`
                      : document.reason
                        ? t.stock.reasons[document.reason]
                        : ''}
                  </td>
                  <td className="table__num num">{document.lineCount}</td>
                  <td className="table__num num">
                    {document.total === null ? '' : formatMoney(document.total, lang)}
                  </td>
                  <td className="muted num">
                    {document.createdAt.date.slice(8)}.{document.createdAt.date.slice(5, 7)}{' '}
                    {document.createdAt.time}
                  </td>
                  <td>
                    <span className={document.status === 'draft' ? 'chip chip--warning' : 'chip'}>
                      {t.stock.statuses[document.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {list.hasNextPage && (
        <div>
          <Button
            variant="secondary"
            busy={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {t.common.more}
          </Button>
        </div>
      )}
    </div>
  );
}

function JournalTab() {
  const t = useT();
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const productId = params.get('product');
  const list = useInfiniteQuery({
    queryKey: [...STOCK_KEY, 'journal', productId],
    queryFn: ({ pageParam }) =>
      call('admin.stockMovements', {
        query: {
          limit: 50,
          ...(productId && { productId }),
          ...(pageParam && { cursor: pageParam }),
        },
      }),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((page) => page.items) ?? [];
  const seesCosts = rows.some((row) => row.unitCost !== null);
  const first = rows[0];
  return (
    <div className="stock__main">
      {productId && (
        <div className="stock__filter-line">
          {first && (
            <span className="chip">
              {t.stock.journal.forProduct(lang === 'ru' ? first.nameRu : first.nameUz)}
            </span>
          )}
          <Button variant="ghost" onClick={() => setParams({ tab: 'journal' }, { replace: true })}>
            {t.stock.journal.showAll}
          </Button>
        </div>
      )}
      {list.isError && <Notice tone="danger">{genericMessage(list.error, t)}</Notice>}
      {list.isSuccess && rows.length === 0 && <p className="muted">{t.stock.journal.empty}</p>}
      {rows.length > 0 && (
        <section className="card stock__table-card">
          <table className="table table--rows">
            <thead>
              <tr>
                <th>{t.stock.journal.columns.at}</th>
                <th>{t.stock.journal.columns.product}</th>
                <th className="table__num">{t.stock.journal.columns.delta}</th>
                {seesCosts && <th className="table__num">{t.stock.journal.columns.cost}</th>}
                <th>{t.stock.journal.columns.document}</th>
                <th>{t.stock.journal.columns.actor}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((move) => (
                <tr key={move.id}>
                  <td className="muted num">
                    {move.at.date.slice(8)}.{move.at.date.slice(5, 7)} {move.at.time}
                  </td>
                  <td>{lang === 'ru' ? move.nameRu : move.nameUz}</td>
                  <td
                    className={
                      move.delta > 0 ? 'table__num num stock__in' : 'table__num num stock__out'
                    }
                  >
                    {move.delta > 0 ? '+' : ''}
                    {formatQty(move.delta, move.unit, lang)}
                  </td>
                  {seesCosts && (
                    <td className="table__num num muted">
                      {move.unitCost === null ? '' : formatMoney(move.unitCost, lang)}
                    </td>
                  )}
                  <td>
                    <Link className="table__link" to={`/stock/documents/${move.document.id}`}>
                      {t.stock.documentTitle(
                        t.stock.documentKinds[move.document.kind],
                        move.document.number,
                      )}
                    </Link>
                  </td>
                  <td className="muted">{move.actorName ?? t.common.none}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {list.hasNextPage && (
        <div>
          <Button
            variant="secondary"
            busy={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {t.common.more}
          </Button>
        </div>
      )}
    </div>
  );
}

function SuppliersTab() {
  const t = useT();
  const can = useCan();
  const [editing, setEditing] = useState<string | null>(null);
  const list = useQuery({ queryKey: SUPPLIERS_KEY, queryFn: () => call('admin.suppliers') });
  const items = list.data?.items ?? [];
  return (
    <div className="stock__main">
      {can('products.write') && (
        <div>
          <Button
            icon={<Plus size={16} aria-hidden="true" />}
            variant="secondary"
            onClick={() => setEditing('new')}
          >
            {t.stock.suppliers.add}
          </Button>
        </div>
      )}
      {list.isError && <Notice tone="danger">{genericMessage(list.error, t)}</Notice>}
      {list.isSuccess && items.length === 0 && <p className="muted">{t.stock.suppliers.empty}</p>}
      {items.length > 0 && (
        <section className="card stock__table-card">
          <table className="table table--rows">
            <thead>
              <tr>
                <th>{t.stock.suppliers.name}</th>
                <th>{t.stock.suppliers.phone}</th>
                <th>{t.stock.suppliers.inn}</th>
                <th>{t.stock.suppliers.note}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((supplier) => (
                <tr key={supplier.id} className={supplier.isActive ? undefined : 'is-hidden'}>
                  <td>
                    {can('products.write') ? (
                      <button
                        type="button"
                        className="table__link stock__link-button"
                        onClick={() => setEditing(supplier.id)}
                      >
                        {supplier.name}
                      </button>
                    ) : (
                      supplier.name
                    )}
                    {!supplier.isActive && (
                      <span className="muted stock__sub">{t.stock.hidden}</span>
                    )}
                  </td>
                  <td className="num">{supplier.phone ?? t.common.none}</td>
                  <td className="num">{supplier.inn ?? t.common.none}</td>
                  <td className="muted">{supplier.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {editing && (
        <SupplierDialog
          supplier={editing === 'new' ? null : (items.find((item) => item.id === editing) ?? null)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function SupplierDialog({
  supplier,
  onClose,
}: {
  supplier: {
    id: string;
    name: string;
    phone: string | null;
    inn: string | null;
    note: string | null;
    isActive: boolean;
  } | null;
  onClose: () => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const [name, setName] = useState(supplier?.name ?? '');
  const [phone, setPhone] = useState(phoneFieldText(supplier?.phone));
  const [inn, setInn] = useState(supplier?.inn ?? '');
  const [note, setNote] = useState(supplier?.note ?? '');
  const [hidden, setHidden] = useState(supplier ? !supplier.isActive : false);
  const orNull = (value: string) => (value.trim() === '' ? null : value.trim());

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name,
        phone: phoneInputState(phone) === 'empty' ? null : phone,
        inn: orNull(inn),
        note: orNull(note),
      };
      return supplier
        ? call('admin.updateSupplier', {
            params: { id: supplier.id },
            body: { ...body, isActive: !hidden },
          })
        : call('admin.createSupplier', { body });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SUPPLIERS_KEY });
      onClose();
    },
  });
  const invalid = invalidFields(save.error);
  const error = (field: string) => (invalid.has(field) ? t.errors.validation : null);

  return (
    <Dialog title={supplier ? t.stock.suppliers.edit : t.stock.suppliers.add} onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <Field
          label={t.stock.suppliers.name}
          value={name}
          required
          maxLength={100}
          error={error('name')}
          onChange={(event) => setName(event.target.value)}
        />
        <div className="form-row">
          <PhoneField
            label={t.stock.suppliers.phone}
            value={phone}
            error={error('phone')}
            onChange={setPhone}
          />
          <Field
            label={t.stock.suppliers.inn}
            inputMode="numeric"
            value={inn}
            maxLength={14}
            hint={t.stock.suppliers.innHint}
            error={error('inn')}
            onChange={(event) => setInn(event.target.value.replace(/\D/g, ''))}
          />
        </div>
        <Field
          label={t.stock.suppliers.note}
          value={note}
          maxLength={300}
          onChange={(event) => setNote(event.target.value)}
        />
        {supplier && (
          <label className="check">
            <input
              type="checkbox"
              checked={hidden}
              onChange={(event) => setHidden(event.target.checked)}
            />
            <span className="check__text">
              {t.stock.suppliers.hide}
              <span className="muted">{t.stock.suppliers.hideHint}</span>
            </span>
          </label>
        )}
        {save.isError && <Notice tone="danger">{apiMessage(save.error, t)}</Notice>}
        <div className="dialog__actions">
          <Button variant="secondary" onClick={onClose}>
            {t.form.cancel}
          </Button>
          <Button
            type="submit"
            busy={save.isPending}
            disabled={!name.trim() || phoneInputState(phone) === 'incomplete'}
          >
            {t.form.save}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
