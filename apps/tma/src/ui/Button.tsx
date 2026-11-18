import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'link';

/** DESIGN 5: primary (accent, 52 px), secondary (white with a border), link (accent text). */
export function Button({
  variant = 'primary',
  icon,
  busy = false,
  children,
  className,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  icon?: ReactNode;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      className={['button', `button--${variant}`, className].filter(Boolean).join(' ')}
      disabled={disabled === true || busy}
      aria-busy={busy}
      {...rest}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}
