import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

/** A labelled input with an optional hint and error (DESIGN 6, forms). */
export function Field({
  label,
  hint,
  error,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  error?: string | null | undefined;
}) {
  const id = useId();
  const describedBy = `${id}-note`;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={error ? 'field__input is-invalid' : 'field__input'}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? describedBy : undefined}
        {...input}
      />
      {(error ?? hint) && (
        <span id={describedBy} className={error ? 'field__error' : 'field__hint'}>
          {error ?? hint}
        </span>
      )}
    </div>
  );
}
