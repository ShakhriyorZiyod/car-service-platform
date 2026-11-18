import type { ReactNode } from 'react';
import { Link } from 'react-router';

/** A number with its label (docs/DESIGN.md, KpiCard); `alert` puts the accent border on it. */
export function KpiCard({
  label,
  value,
  note,
  alert = false,
  to,
}: {
  label: string;
  value: number;
  note: ReactNode;
  alert?: boolean;
  to: string;
}) {
  return (
    <Link to={to} className={alert ? 'kpi kpi--alert card' : 'kpi card'}>
      <span className="kpi__label">{label}</span>
      <span className="kpi__value num">{value}</span>
      <span className="kpi__note muted">{note}</span>
    </Link>
  );
}
