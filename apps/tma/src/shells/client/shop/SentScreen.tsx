import { CheckCircle2 } from 'lucide-react';
import { useT } from '../../../i18n';
import { Button } from '../../../ui/Button';
import { EmptyState } from '../../../ui/client-parts';

/** The shop order was placed: its number and what happens next. */
export function SentScreen({
  number,
  onOrders,
  onShop,
}: {
  number: number;
  onOrders: () => void;
  onShop: () => void;
}) {
  const t = useT().client.shop;
  return (
    <section className="screen">
      <EmptyState
        icon={<CheckCircle2 size={28} />}
        title={t.sentTitle}
        text={t.sentText(number)}
        action={
          <>
            <Button onClick={onOrders}>{t.myOrders}</Button>
            <Button variant="secondary" onClick={onShop}>
              {t.toShop}
            </Button>
          </>
        }
      />
    </section>
  );
}
