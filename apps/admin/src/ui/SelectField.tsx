import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';

/** A labelled drop-down, laid out like `Field`. */
export function SelectField({
  label,
  hint,
  error,
  children,
  ...select
}: SelectHTMLAttributes<HTMLSelectElement> & {
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
      <select
        id={id}
        className={error ? 'field__input is-invalid' : 'field__input'}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? describedBy : undefined}
        {...select}
      >
        {children}
      </select>
      {(error ?? hint) && (
        <span id={describedBy} className={error ? 'field__error' : 'field__hint'}>
          {error ?? hint}
        </span>
      )}
    </div>
  );
}
