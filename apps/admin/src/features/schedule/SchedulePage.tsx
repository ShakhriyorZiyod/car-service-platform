import type { Schedule } from '@cs/shared';
import { formatDateLong } from '@cs/shared/format';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { call } from '../../api';
import { useCan } from '../../auth/session';
import { useLang, useT } from '../../i18n';
import { genericMessage } from '../../lib/errors';
import { POLL_MS, SCHEDULE_KEY } from '../../lib/keys';
import { minutesOf, shiftDate } from '../../lib/time';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { BlockDialog, BlockDetailDialog } from './BlockDialogs';
import './schedule.css';

type Item = Schedule['boxes'][number]['items'][number];

/** "Jadval" (design A4): the day, box by box, with a line for the present moment. */
export function SchedulePage() {
  const t = useT();
  const lang = useLang();
  const can = useCan();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? undefined;
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<{ item: Item; boxName: string } | null>(null);

  const day = useQuery({
    queryKey: [...SCHEDULE_KEY, date ?? 'today'],
    queryFn: () => call('admin.schedule', { query: { ...(date && { date }) } }),
    refetchInterval: POLL_MS,
  });

  const go = (next: string | null) => {
    const copy = new URLSearchParams(params);
    if (next) copy.set('date', next);
    else copy.delete('date');
    setParams(copy, { replace: true });
  };
  const data = day.data;

  return (
    <section className="schedule">
      <header className="schedule__head">
        <h1 className="page-title">{t.schedule.title}</h1>
        <div className="schedule__nav">
          <Button
            variant="secondary"
            aria-label={t.schedule.prevDay}
            disabled={!data}
            onClick={() => data && go(shiftDate(data.date, -1))}
            icon={<ChevronLeft size={16} aria-hidden="true" />}
          />
          <span className="schedule__date">{data ? formatDateLong(data.date, lang) : ''}</span>
          <Button
            variant="secondary"
            aria-label={t.schedule.nextDay}
            disabled={!data}
            onClick={() => data && go(shiftDate(data.date, 1))}
            icon={<ChevronRight size={16} aria-hidden="true" />}
          />
          <Button variant="secondary" onClick={() => go(null)}>
            {t.schedule.goToday}
          </Button>
          <input
            type="date"
            className="field__input schedule__picker"
            aria-label={t.common.chooseDate}
            value={data?.date ?? ''}
            onChange={(event) => event.target.value && go(event.target.value)}
          />
        </div>
        {can('schedule.write') && (
          <Button
            icon={<Lock size={16} aria-hidden="true" />}
            disabled={!data?.hours}
            onClick={() => setCreating(true)}
          >
            {t.schedule.addBlock}
          </Button>
        )}
      </header>

      {day.isError && <Notice tone="danger">{genericMessage(day.error, t)}</Notice>}
      {data && !data.hours && data.closedReason && (
        <Notice tone="info">{t.schedule.closed[data.closedReason]}</Notice>
      )}
      {data && data.boxes.length === 0 && <p className="muted">{t.schedule.noBoxes}</p>}

      {data?.hours && data.boxes.length > 0 && (
        <>
          <Grid
            schedule={data}
            hours={data.hours}
            onOpen={(item, boxName) => {
              if (item.order) void navigate(`/orders/${item.order.id}`);
              else setViewing({ item, boxName });
            }}
          />
          <ul className="legend">
            <li>
              <span className="legend__swatch legend__swatch--new" />
              {t.schedule.legend.new}
            </li>
            <li>
              <span className="legend__swatch legend__swatch--confirmed" />
              {t.schedule.legend.confirmed}
            </li>
            <li>
              <span className="legend__swatch legend__swatch--in_work" />
              {t.schedule.legend.in_work}
            </li>
            <li>
              <span className="legend__swatch legend__swatch--block" />
              {t.schedule.legend.block}
            </li>
          </ul>
        </>
      )}

      {creating && data?.hours && (
        <BlockDialog schedule={data} hours={data.hours} onClose={() => setCreating(false)} />
      )}
      {viewing && (
        <BlockDetailDialog
          date={data?.date ?? ''}
          item={viewing.item}
          boxName={viewing.boxName}
          onClose={() => setViewing(null)}
        />
      )}
    </section>
  );
}

function Grid({
  schedule,
  hours,
  onOpen,
}: {
  schedule: Schedule;
  hours: NonNullable<Schedule['hours']>;
  onOpen: (item: Item, boxName: string) => void;
}) {
  const t = useT();
  const open = minutesOf(hours.open);
  const close = minutesOf(hours.close);
  const span = close - open;
  const pct = (minutes: number) =>
    `${((Math.min(Math.max(minutes, open), close) - open) / span) * 100}%`;

  // A job that began on an earlier day, or ends on a later one, is cut at the day's edges.
  const startOf = (item: Item) =>
    item.startsAt.date < schedule.date ? open : minutesOf(item.startsAt.time);
  const endOf = (item: Item) =>
    item.endsAt.date > schedule.date ? close : minutesOf(item.endsAt.time);

  const firstHour = Math.ceil(open / 60);
  const lastHour = Math.floor(close / 60);
  const hourMarks = Array.from(
    { length: Math.max(0, lastHour - firstHour + 1) },
    (_, i) => firstHour + i,
  );

  const now = schedule.now;
  const showNow =
    now.date === schedule.date && minutesOf(now.time) >= open && minutesOf(now.time) <= close;
  const breakStart = hours.breakStart ? minutesOf(hours.breakStart) : null;
  const breakEnd = hours.breakEnd ? minutesOf(hours.breakEnd) : null;

  return (
    <div className="grid card">
      <div className="grid__row grid__row--head">
        <span className="grid__label" />
        <div className="grid__track">
          {hourMarks.map((hour) => (
            <span key={hour} className="grid__hour num" style={{ left: pct(hour * 60) }}>
              {String(hour).padStart(2, '0')}:00
            </span>
          ))}
        </div>
      </div>
      {schedule.boxes.map((box) => (
        <div key={box.id} className="grid__row">
          <span className="grid__label">{box.name}</span>
          <div className="grid__track grid__track--lane">
            {hourMarks.map((hour) => (
              <span key={hour} className="grid__line" style={{ left: pct(hour * 60) }} />
            ))}
            {breakStart !== null && breakEnd !== null && (
              <span
                className="grid__break"
                style={{
                  left: pct(breakStart),
                  width: `calc(${pct(breakEnd)} - ${pct(breakStart)})`,
                }}
              />
            )}
            {box.items.map((item) => {
              const left = startOf(item);
              const right = endOf(item);
              const status = item.order?.status ?? 'block';
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`slot-card slot-card--${status}`}
                  style={{ left: pct(left), width: `calc(${pct(right)} - ${pct(left)})` }}
                  onClick={() => onOpen(item, box.name)}
                >
                  {item.order ? (
                    <>
                      <span className="slot-card__title num">
                        №{item.order.number} · {item.startsAt.time}
                      </span>
                      <span className="slot-card__text">{item.order.carLabel}</span>
                      <span className="slot-card__text muted">{item.order.clientName}</span>
                    </>
                  ) : (
                    <>
                      <span className="slot-card__title">{t.schedule.legend.block}</span>
                      <span className="slot-card__text">{item.note}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {showNow && (
        <div className="grid__now-layer" aria-hidden="true">
          <div className="grid__now-track">
            <span className="grid__now" style={{ left: pct(minutesOf(now.time)) }}>
              <span className="grid__now-label num">{t.schedule.now(now.time)}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
