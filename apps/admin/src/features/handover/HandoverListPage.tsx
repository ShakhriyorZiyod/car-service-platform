import { formatMoney } from '@cs/shared/format';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { call } from '../../api';
import { useLang, useT } from '../../i18n';
import { genericMessage } from '../../lib/errors';
import { ORDERS_KEY, POLL_MS, TODAY_KEY } from '../../lib/keys';
import { Notice } from '../../ui/Notice';
import { PlateChip } from '../../ui/PlateChip';
import { CashCard } from '../../ui/CashCard';
import './handover.css';

/** "Topshirish va kassa": the cars waiting to be picked up, and the day's takings. */
export function HandoverListPage() {
  const t = useT();
  const lang = useLang();
  const orders = useQuery({
    queryKey: [...ORDERS_KEY, 'handover'],
    queryFn: () => call('admin.orders', { query: {} }),
    refetchInterval: POLL_MS,
  });
  const today = useQuery({
    queryKey: TODAY_KEY,
    queryFn: () => call('admin.today'),
    refetchInterval: POLL_MS,
  });
  const ready = (orders.data?.items ?? []).filter((order) => order.status === 'ready_for_pickup');

  return (
    <section className="handover">
      <h1 className="page-title">{t.handover.listTitle}</h1>
      {(orders.isError || today.isError) && (
        <Notice tone="danger">{genericMessage(orders.error ?? today.error, t)}</Notice>
      )}
      <div className="handover__grid">
        <section className="card handover__card">
          <h2 className="section-title">{t.handover.readyTitle}</h2>
          {orders.data && ready.length === 0 && <p className="muted">{t.handover.readyEmpty}</p>}
          {ready.length > 0 && (
            <table className="table">
              <tbody>
                {ready.map((order) => (
                  <tr key={order.id}>
                    <td className="num">№{order.number}</td>
                    <td>
                      <span className="handover__row-car">
                        {order.car.label} <PlateChip plate={order.car.plate} />
                      </span>
                      <span className="muted">{order.client.fullName}</span>
                    </td>
                    <td className="table__num num">{formatMoney(order.total, lang)}</td>
                    <td className="table__num">
                      <Link className="btn btn--primary" to={`/orders/${order.id}/handover`}>
                        {t.handover.open}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        {today.data?.cash && <CashCard cash={today.data.cash} />}
      </div>
    </section>
  );
}
