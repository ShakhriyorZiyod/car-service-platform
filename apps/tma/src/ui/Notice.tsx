import type { ReactNode } from 'react';

/** A message on a tinted background: information, a warning or an error (DESIGN 5). */
export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning' | 'danger';
  children: ReactNode;
}) {
  return (
    <p className={`notice notice--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
