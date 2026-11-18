import type { Cash } from '@cs/shared';
import { formatAmount, formatMoney } from '@cs/shared/format';
import { useLang, useT } from '../i18n';

/** "Bugungi kassa" (design A6): the day's takings by method, in all, and the receipts. */
export function CashCard({ cash }: { cash: Cash }) {
  const t = useT();
  const lang = useLang();
  return (
    <section className="card cash">
      <h2 className="section-title">{t.handover.cashTitle}</h2>
      <dl className="cash__rows">
        {cash.byMethod.map((line) => (
          <div key={line.method} className="cash__row">
            <dt>{t.paymentMethod[line.method]}</dt>
            <dd className="num">{formatAmount(line.amount)}</dd>
          </div>
        ))}
        <div className="cash__row cash__row--total">
          <dt>{t.handover.cashTotal(cash.receipts)}</dt>
          <dd className="num">{formatMoney(cash.total, lang)}</dd>
        </div>
      </dl>
    </section>
  );
}
