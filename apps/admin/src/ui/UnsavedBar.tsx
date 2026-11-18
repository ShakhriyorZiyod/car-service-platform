import type { ReactNode } from 'react';
import { useT } from '../i18n';
import { Button } from './Button';

/**
 * DESIGN 6, UnsavedBar: a dark bar that stays at the bottom while a form has changes nobody has
 * saved yet. It says how many, and offers to throw them away or keep them.
 */
export function UnsavedBar({
  title,
  note,
  busy = false,
  canSave = true,
  onCancel,
  onSave,
}: {
  title: ReactNode;
  note?: ReactNode;
  busy?: boolean;
  canSave?: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const t = useT();
  return (
    <div className="unsaved-bar" role="region">
      <p className="unsaved-bar__text">
        <strong>{title}</strong> {note}
      </p>
      <div className="unsaved-bar__actions">
        <button type="button" className="unsaved-bar__cancel" onClick={onCancel} disabled={busy}>
          {t.form.cancel}
        </button>
        <Button busy={busy} disabled={!canSave} onClick={onSave}>
          {t.form.save}
        </Button>
      </div>
    </div>
  );
}
