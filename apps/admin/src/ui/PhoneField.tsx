import { formatPhoneInput, PHONE_PREFIX, phoneInputState } from '@cs/shared/format';
import { useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import { Field } from './Field';

/** What a phone field starts with: a stored number as it is shown, or the "+998 " prefix. */
export const phoneFieldText = (stored: string | null | undefined): string =>
  stored ? formatPhoneInput(stored) : PHONE_PREFIX;

/** How many of the nine local digits an Uzbek number still lacks; null for another country. */
const missingDigits = (text: string): number | null => {
  if (!text.startsWith('+998')) return null;
  return Math.max(0, 9 - (text.replace(/\D/g, '').length - 3));
};

/**
 * A phone, always in one form (PLAN 22, 2026-11-24): "+998" stands first and the digits fall into
 * "+998 90 123 45 67" as they are typed or pasted; "+" with another code takes a foreign number.
 * While the number is incomplete the form's save waits (`phoneInputState`), and the field says
 * what is missing: as a hint while typing, as an error once the person leaves it.
 */
export function PhoneField({
  label,
  value,
  onChange,
  hint,
  error,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  hint?: ReactNode;
  error?: string | null | undefined;
  disabled?: boolean;
}) {
  const t = useT();
  const [left, setLeft] = useState(false);
  const incomplete = !disabled && phoneInputState(value) === 'incomplete';
  const missing = missingDigits(value);
  const why =
    missing === null ? t.phoneField.incompleteForeign : t.phoneField.incompleteLocal(missing);

  return (
    <Field
      label={label}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder={t.phoneField.example}
      maxLength={24}
      value={value}
      disabled={disabled}
      hint={incomplete && !left ? why : (hint ?? t.phoneField.hint)}
      error={error ?? (incomplete && left ? why : null)}
      onFocus={() => setLeft(false)}
      onBlur={() => setLeft(true)}
      onChange={(event) => onChange(formatPhoneInput(event.target.value))}
    />
  );
}
