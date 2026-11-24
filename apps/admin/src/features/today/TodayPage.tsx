import { formatDateLong, formatQty } from '@cs/shared/format';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { call } from '../../api';
import { useCan } from '../../auth/session';
import { useLang, useT } from '../../i18n';
import { genericMessage } from '../../lib/errors';
import { POLL_MS, TODAY_KEY } from '../../lib/keys';
import { CashCard } from '../../ui/CashCard';
import { KpiCard } from '../../ui/KpiCard';
import { Notice } from '../../ui/Notice';
import { PlateChip } from '../../ui/PlateChip';
import { StatusChip } from '../../ui/StatusChip';
import './today.css';

/** "Bugun" (design A6): what needs attention now, and the visits of the day. */
export function TodayPage() {
  const t = useT();
  const lang = useLang();
  const can = useCan();
  const today = useQuery({
    queryKey: TODAY_KEY,
    queryFn: () => call('admin.today'),
    refetchInterval: POLL_MS,
  });

  const data = today.data;
  return (
    <section className="today">
      <header className="today__head">
        <h1 className="page-title">{t.today.title}</h1>
        {data && <span className="muted">{formatDateLong(data.now.date, lang)}</span>}
      </header>

      {today.isError && <Notice tone="danger">{genericMessage(today.error, t)}</Notice>}

      {data && (
        <>
          <div className="today__kpis">
            <KpiCard
              to="/orders"
              label={t.today.kpi.newOrders}
              value={data.counters.newOrders}
              alert={data.counters.unanswered > 0}
              note={
                data.counters.unanswered > 0 ? (
                  <span className="today__late">
                    {t.today.kpi.unanswered(data.counters.unanswered)}
                  </span>
                ) : (
                  t.today.kpi.newOrdersNote
                )
              }
            />
            <KpiCard
              to="/schedule"
              label={t.today.kpi.arrivals}
              value={data.counters.arrivalsToday}
              note={t.today.kpi.arrivalsNote}
            />
            <KpiCard
              to="/orders"
              label={t.today.kpi.inWork}
              value={data.counters.inWork}
              note={
                data.reports.length > 0
                  ? t.today.kpi.inReview(data.reports.length)
                  : t.today.kpi.inWorkNote
              }
            />
            <KpiCard
              to="/orders"
              label={t.today.kpi.ready}
              value={data.counters.readyForPickup}
              note={t.today.kpi.readyNote}
            />
          </div>

          <div className="today__grid">
            <section className="card today__table-card">
              <h2 className="section-title today__table-title">{t.today.arrivalsTitle}</h2>
              {data.arrivals.length === 0 ? (
                <p className="muted today__empty">{t.today.arrivalsEmpty}</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t.today.columns.time}</th>
                      <th>{t.today.columns.order}</th>
                      <th>{t.today.columns.car}</th>
                      <th>{t.today.columns.client}</th>
                      <th>{t.today.columns.status}</th>
                      <th>{t.today.columns.box}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.arrivals.map((order) => (
                      <tr key={order.id}>
                        <td className="num">{order.startsAt.time}</td>
                        <td>
                          <Link className="table__link num" to={`/orders/${order.id}`}>
                            №{order.number}
                          </Link>
                        </td>
                        <td>
                          <span className="today__car">
                            {order.car.label} <PlateChip plate={order.car.plate} />
                          </span>
                        </td>
                        <td>{order.client.fullName}</td>
                        <td>
                          <StatusChip status={order.status} />
                        </td>
                        <td className="muted">{order.boxName ?? t.common.none}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <aside className="today__side">
              {can('tasks.review') && (
                <section className="card today__reports">
                  <h2 className="section-title">{t.today.reportsTitle}</h2>
                  {data.reports.length === 0 ? (
                    <p className="muted">{t.today.reportsEmpty}</p>
                  ) : (
                    <ul className="today__report-list">
                      {data.reports.map((report) => (
                        <li key={report.id}>
                          <Link className="today__report" to={`/tasks/${report.id}`}>
                            <span>
                              <strong>{report.master.fullName}</strong>,{' '}
                              {t.today.reportOrder(report.orderNumber)}{' '}
                              {report.items
                                .map((item) => (lang === 'ru' ? item.nameRu : item.nameUz))
                                .join(', ')}
                            </span>
                            <span className="today__report-time num">
                              {t.today.minutes(report.waitingMin)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
              {data.cash && <CashCard cash={data.cash} />}
              {data.shop && (data.shop.newOrders > 0 || data.shop.readyForPickup > 0) && (
                <section className="card today__reports">
                  <h2 className="section-title">{t.shop.today.title}</h2>
                  <ul className="today__report-list">
                    {data.shop.newOrders > 0 && (
                      <li>
                        <Link className="today__report" to="/shop?tab=new">
                          <span>{t.shop.today.newOrders(data.shop.newOrders)}</span>
                        </Link>
                      </li>
                    )}
                    {data.shop.readyForPickup > 0 && (
                      <li>
                        <Link className="today__report" to="/shop?tab=ready_for_pickup">
                          <span>{t.shop.today.ready(data.shop.readyForPickup)}</span>
                        </Link>
                      </li>
                    )}
                  </ul>
                </section>
              )}
              {data.lowStock && (
                <section className="card today__reports">
                  <h2 className="section-title">{t.stock.low.title}</h2>
                  {data.lowStock.length === 0 ? (
                    <p className="muted">{t.stock.low.empty}</p>
                  ) : (
                    <ul className="today__report-list">
                      {data.lowStock.slice(0, 6).map((item) => (
                        <li key={item.productId}>
                          <Link className="today__report" to="/stock?filter=low">
                            <span>{lang === 'ru' ? item.nameRu : item.nameUz}</span>
                            <span className="today__report-time num">
                              {t.stock.low.line(
                                formatQty(item.free, item.unit, lang),
                                formatQty(item.minQty, item.unit, lang),
                              )}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  {data.lowStock.length > 6 && (
                    <Link className="table__link" to="/stock?filter=low">
                      {t.stock.low.open}
                    </Link>
                  )}
                </section>
              )}
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
