import type { ReactNode } from 'react';
import { useT } from '../i18n';
import { apiMessage } from '../lib/errors';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Notice } from './Notice';

/**
 * "Are you sure?" before what cannot be taken back with one click: signing out, a price that is fixed
 * once saved, the client's answer by phone, the verbal confirmation, a payment method. The parent
 * mounts it while it is open; it closes itself only through `onClose`.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger = false,
  pending = false,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** The confirming button says "this removes or refuses something". */
  danger?: boolean;
  pending?: boolean;
  error?: unknown;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <Dialog title={title} onClose={onClose}>
      <div className="form-stack">
        {children}
        {error !== null && error !== undefined && (
          <Notice tone="danger">{apiMessage(error, t)}</Notice>
        )}
        <div className="dialog__actions">
          <Button variant="secondary" onClick={onClose}>
            {t.form.cancel}
          </Button>
          <Button
            {...(danger && { variant: 'secondary', className: 'btn--danger' })}
            busy={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
