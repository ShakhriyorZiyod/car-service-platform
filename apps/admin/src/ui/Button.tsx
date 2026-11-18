import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

/** DESIGN 6: primary (accent), secondary (white with a border), ghost (text only). */
export function Button({
  variant = 'primary',
  icon,
  busy = false,
  children,
  className,
  disabled,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  icon?: ReactNode;
  busy?: boolean;
}) {
  return (
    <button
      type={type}
      className={['btn', `btn--${variant}`, className].filter(Boolean).join(' ')}
      disabled={disabled === true || busy}
      aria-busy={busy}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
