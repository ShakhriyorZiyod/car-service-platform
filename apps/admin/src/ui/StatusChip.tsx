import type { OrderStatus } from '@cs/shared/vocabulary';
import { useT } from '../i18n';

/** A dot and the status word on the status colour (docs/DESIGN.md, section 2.3). */
export function StatusChip({ status }: { status: OrderStatus }) {
  const t = useT();
  return (
    <span className={`status status--${status}`}>
      <span className="status__dot" aria-hidden="true" />
      {t.status[status]}
    </span>
  );
}
