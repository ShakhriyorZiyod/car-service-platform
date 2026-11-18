import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useT } from '../i18n';

/** A modal window. The parent mounts it while it is open and unmounts it on `onClose`. */
export function Dialog({
  title,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className={wide ? 'dialog dialog--wide' : 'dialog'}
      aria-labelledby={titleId}
      onClose={onClose}
      // A click on the dim backdrop lands on the dialog itself, not on its content.
      onClick={(event) => event.target === ref.current && onClose()}
    >
      <div className="dialog__body">
        <header className="dialog__head">
          <h2 id={titleId} className="section-title">
            {title}
          </h2>
          <button
            type="button"
            className="dialog__close"
            aria-label={t.common.close}
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
