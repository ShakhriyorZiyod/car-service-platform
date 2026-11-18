import type { AuditEntry } from '@cs/shared';
import { formatDateLong } from '@cs/shared/format';
import { useInfiniteQuery } from '@tanstack/react-query';
import { call } from '../../api';
import { useLang, useT } from '../../i18n';
import { genericMessage } from '../../lib/errors';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.map(show).join(', ');
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** What changed, field by field; for a new record, who or what it is. */
function describe(entry: AuditEntry): string {
  const { before, after } = entry;
  if (isRecord(before) && isRecord(after)) {
    return Object.keys(after)
      .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      .map((key) => `${key}: ${show(before[key])} → ${show(after[key])}`)
      .join('; ');
  }
  if (isRecord(after)) return show(after.fullName ?? after.name);
  return '';
}

/** Who changed what, newest first (PLAN 7.3); read-only for everyone, the database included. */
export function AuditTab() {
  const t = useT();
  const lang = useLang();
  const audit = useInfiniteQuery({
    queryKey: ['audit'],
    queryFn: ({ pageParam }) =>
      call('admin.auditLog', { query: { limit: 50, ...(pageParam && { cursor: pageParam }) } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

  const entries = audit.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section className="card audit">
      {audit.isError && <Notice tone="danger">{genericMessage(audit.error, t)}</Notice>}
      <table className="audit__table">
        <thead>
          <tr>
            <th>{t.audit.when}</th>
            <th>{t.audit.who}</th>
            <th>{t.audit.what}</th>
            <th>{t.audit.details}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="audit__when">
                {formatDateLong(entry.at.date, lang)}, <span className="num">{entry.at.time}</span>
              </td>
              <td>{entry.actor?.fullName ?? t.audit.system}</td>
              <td>{t.audit.actions[entry.action] ?? entry.action}</td>
              <td className="audit__details">{describe(entry)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {audit.isSuccess && entries.length === 0 && (
        <p className="muted audit__empty">{t.audit.empty}</p>
      )}
      {audit.hasNextPage && (
        <div className="audit__more">
          <Button
            variant="secondary"
            busy={audit.isFetchingNextPage}
            onClick={() => void audit.fetchNextPage()}
          >
            {t.audit.more}
          </Button>
        </div>
      )}
    </section>
  );
}
