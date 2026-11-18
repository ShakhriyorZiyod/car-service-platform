import type { AuditEntry } from '@cs/shared';
import { formatAmount, formatDateLong } from '@cs/shared/format';
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
  // A list of numbers reads as it is (reminder hours); a list of ids is only worth its length.
  if (Array.isArray(value)) {
    return value.every((item) => typeof item === 'number')
      ? value.join(', ')
      : value.every((item) => typeof item === 'string' && item.length < 24)
        ? value.join(', ')
        : `${value.length}`;
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** Nested records become one level of dotted names: `rules.slotStepMin`. */
function flatten(value: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (isRecord(item)) Object.assign(flat, flatten(item, `${prefix}${key}.`));
    else flat[`${prefix}${key}`] = item;
  }
  return flat;
}

interface WorkDayLog {
  weekday: number;
  open: string;
  close: string;
  breakStart: string | null;
  breakEnd: string | null;
}

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

interface PriceCellLog {
  zone: string;
  bodyClass: string;
  price: number | null;
  durationMin: number;
}

/** The changed cells of `prices.update`: "Kapot M: 1 400 000 → 1 500 000". */
function describePrices(entry: AuditEntry): string {
  const cellsOf = (value: unknown): PriceCellLog[] =>
    isRecord(value) && Array.isArray(value.cells) ? (value.cells as PriceCellLog[]) : [];
  const before = cellsOf(entry.before);
  const price = (cell: PriceCellLog | undefined) =>
    cell === undefined ? '—' : cell.price === null ? '∅' : formatAmount(cell.price);
  return cellsOf(entry.after)
    .map((cell) => {
      const was = before.find((old) => old.zone === cell.zone && old.bodyClass === cell.bodyClass);
      return `${cell.zone} ${cell.bodyClass}: ${price(was)} → ${price(cell)}`;
    })
    .join('; ');
}

/** The week as it became: "Dushanba 09:00–20:00 (tanaffus 13:00–14:00); …". */
function describeWeek(entry: AuditEntry, weekdayName: (weekday: number) => string): string {
  const days = Array.isArray(entry.after) ? (entry.after as WorkDayLog[]) : [];
  return days
    .map((day) => {
      const pause = day.breakStart ? ` (${day.breakStart}–${day.breakEnd})` : '';
      return `${weekdayName(day.weekday)} ${day.open}–${day.close}${pause}`;
    })
    .join('; ');
}

/** What changed, field by field; for a new record, who or what it is. */
function describe(entry: AuditEntry, weekdayName: (weekday: number) => string): string {
  if (entry.action === 'prices.update') return describePrices(entry);
  if (entry.action === 'work_hours.update') return describeWeek(entry, weekdayName);
  const { before, after } = entry;
  if (isRecord(before) && isRecord(after)) {
    const was = flatten(before);
    const is = flatten(after);
    return Object.keys(is)
      .filter((key) => JSON.stringify(was[key]) !== JSON.stringify(is[key]))
      .map((key) => `${key}: ${show(was[key])} → ${show(is[key])}`)
      .join('; ');
  }
  if (isRecord(after)) {
    return after.date !== undefined && after.name !== undefined
      ? `${show(after.date)}: ${show(after.name)}`
      : show(after.fullName ?? after.name);
  }
  if (isRecord(before)) return show(before.name);
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
  const weekdayName = (weekday: number) => t.hours.weekdays[WEEKDAY_KEYS[weekday - 1] ?? 'mon'];

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
              <td className="audit__details">{describe(entry, weekdayName)}</td>
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
