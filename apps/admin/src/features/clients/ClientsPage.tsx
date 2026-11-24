import { formatDateLong, formatPhone, PHONE_PREFIX, phoneInputState } from '@cs/shared/format';
import { CLIENT_FILTERS, type ClientFilter } from '@cs/shared/vocabulary';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { call } from '../../api';
import { useCan } from '../../auth/session';
import { useLang, useT } from '../../i18n';
import { apiMessage, genericMessage, invalidFields } from '../../lib/errors';
import { CLIENTS_KEY } from '../../lib/keys';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { PhoneField } from '../../ui/PhoneField';
import { UnmappedCars } from './UnmappedCars';
import './clients.css';

/** "Mijozlar" (design A10): the list, its filters and search, and the cars waiting for a model. */
export function ClientsPage() {
  const t = useT();
  const lang = useLang();
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const filter = (CLIENT_FILTERS as readonly string[]).includes(params.get('filter') ?? '')
    ? (params.get('filter') as ClientFilter)
    : 'all';
  const urlQuery = params.get('q') ?? '';
  const [text, setText] = useState(urlQuery);
  const [creating, setCreating] = useState(false);

  // The search box types freely; the list asks after a short pause.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (text.trim()) next.set('q', text.trim());
      else next.delete('q');
      if (next.toString() !== params.toString()) setParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [text, params, setParams]);

  const list = useInfiniteQuery({
    queryKey: [...CLIENTS_KEY, 'list', filter, urlQuery],
    queryFn: ({ pageParam }) =>
      call('admin.clients', {
        query: {
          filter,
          limit: 30,
          ...(urlQuery && { q: urlQuery }),
          ...(pageParam && { cursor: pageParam }),
        },
      }),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((page) => page.items) ?? [];

  const pick = (value: ClientFilter) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('filter');
    else next.set('filter', value);
    setParams(next, { replace: true });
  };

  return (
    <section className="clients">
      <header className="clients__head">
        <h1 className="page-title">{t.clients.title}</h1>
        {can('clients.write') && (
          <Button icon={<Plus size={16} aria-hidden="true" />} onClick={() => setCreating(true)}>
            {t.clients.add}
          </Button>
        )}
      </header>

      <UnmappedCars />

      <div className="clients__tools">
        <label className="topbar__search clients__search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            placeholder={t.clients.searchPlaceholder}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <div className="pills">
          {CLIENT_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              className={filter === value ? 'pill is-active' : 'pill'}
              onClick={() => pick(value)}
            >
              {t.clients.filters[value]}
            </button>
          ))}
        </div>
      </div>

      {list.isError && <Notice tone="danger">{genericMessage(list.error, t)}</Notice>}
      {list.isSuccess && rows.length === 0 && <p className="muted">{t.clients.empty}</p>}
      {rows.length > 0 && (
        <section className="card">
          <table className="table table--rows">
            <thead>
              <tr>
                <th>{t.clients.columns.name}</th>
                <th>{t.clients.columns.phone}</th>
                <th className="table__num">{t.clients.columns.cars}</th>
                <th className="table__num">{t.clients.columns.orders}</th>
                <th>{t.clients.columns.last}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((client) => (
                <tr key={client.id}>
                  <td>
                    <Link className="table__link" to={`/clients/${client.id}`}>
                      {client.fullName}
                    </Link>
                    {!client.hasTelegram && !client.isAnonymized && (
                      <span className="chip clients__chip">{t.clients.noTelegram}</span>
                    )}
                    {client.deletionRequested && !client.isAnonymized && (
                      <span className="chip chip--danger clients__chip">
                        {t.clients.deletionRequested}
                      </span>
                    )}
                    {client.isAnonymized && (
                      <span className="chip clients__chip">{t.clients.anonymized}</span>
                    )}
                  </td>
                  <td className="num">
                    {client.phone ? formatPhone(client.phone) : t.common.none}
                  </td>
                  <td className="table__num num">{client.carsCount}</td>
                  <td className="table__num num">{client.ordersCount}</td>
                  <td className="muted">
                    {client.lastVisit
                      ? formatDateLong(client.lastVisit.date, lang)
                      : t.clients.never}
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

      {creating && <NewClientDialog onClose={() => setCreating(false)} />}
    </section>
  );
}

function NewClientDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState(PHONE_PREFIX);

  const create = useMutation({
    mutationFn: () => call('admin.createClient', { body: { fullName, phone } }),
    onSuccess: async (card) => {
      await queryClient.invalidateQueries({ queryKey: CLIENTS_KEY });
      void navigate(`/clients/${card.id}`);
    },
  });
  const invalid = invalidFields(create.error);

  return (
    <Dialog title={t.clients.newTitle} onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <Field
          label={t.newOrder.clientName}
          value={fullName}
          maxLength={80}
          error={invalid.has('fullName') ? t.errors.validation : null}
          onChange={(event) => setFullName(event.target.value)}
        />
        <PhoneField
          label={t.newOrder.clientPhone}
          hint={t.clients.newHint}
          value={phone}
          error={invalid.has('phone') ? t.errors.validation : null}
          onChange={setPhone}
        />
        {create.isError && <Notice tone="danger">{apiMessage(create.error, t)}</Notice>}
        <div className="dialog__actions">
          <Button variant="secondary" onClick={onClose}>
            {t.form.cancel}
          </Button>
          <Button
            type="submit"
            busy={create.isPending}
            disabled={!fullName.trim() || phoneInputState(phone) !== 'complete'}
          >
            {t.clients.create}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
