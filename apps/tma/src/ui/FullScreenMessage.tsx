import type { ReactNode } from 'react';

/**
 * A whole screen for one message: the error state (client PDF, page 19), or a pointer to open the
 * app from Telegram. An icon in a tinted circle, a title, a text and an optional action.
 */
export function FullScreenMessage({
  icon,
  tone = 'neutral',
  title,
  children,
  action,
}: {
  icon: ReactNode;
  tone?: 'neutral' | 'danger';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <main className="full-message">
      <div className={`full-message__icon full-message__icon--${tone}`} aria-hidden="true">
        {icon}
      </div>
      <h1 className="title">{title}</h1>
      {children}
      {action}
    </main>
  );
}
