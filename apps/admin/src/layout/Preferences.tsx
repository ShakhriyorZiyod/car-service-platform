import { LANG_NAMES, LANGS, ROLE_LABELS } from '@cs/shared/i18n';
import { useMutation } from '@tanstack/react-query';
import { Monitor, Moon, Sun } from 'lucide-react';
import { call } from '../api';
import { useMe, useSetMe } from '../auth/session';
import { useLang, useT } from '../i18n';
import { chooseTheme, THEME_CHOICES, useThemeChoice } from '../lib/theme';

const THEME_ICONS = { auto: Monitor, light: Sun, dark: Moon } as const;

/**
 * The light or dark mode and the language. In the top bar on a wide screen, in the menu on a
 * narrow one (layout.css): the same buttons, only the place differs.
 */
export function Preferences({ className }: { className: string }) {
  const t = useT();
  const lang = useLang();
  const setMe = useSetMe();
  const theme = useThemeChoice();

  const changeLang = useMutation({
    mutationFn: (next: (typeof LANGS)[number]) => call('auth.updateMe', { body: { lang: next } }),
    onSuccess: setMe,
  });

  return (
    <div className={className}>
      <div className="topbar__langs" role="radiogroup" aria-label={t.theme.label}>
        {THEME_CHOICES.map((value) => {
          const Icon = THEME_ICONS[value];
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={value === theme}
              aria-label={t.theme[value]}
              title={t.theme[value]}
              className={
                value === theme
                  ? 'topbar__lang topbar__theme is-active'
                  : 'topbar__lang topbar__theme'
              }
              onClick={() => chooseTheme(value)}
            >
              <Icon size={14} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div className="topbar__langs">
        {LANGS.map((value) => (
          <button
            key={value}
            type="button"
            className={value === lang ? 'topbar__lang is-active' : 'topbar__lang'}
            disabled={changeLang.isPending}
            onClick={() => value !== lang && changeLang.mutate(value)}
          >
            {LANG_NAMES[value]}
          </button>
        ))}
      </div>
    </div>
  );
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

/** Who is signed in: initials, name and roles. */
export function Who({ className }: { className: string }) {
  const lang = useLang();
  const me = useMe();
  return (
    <div className={className}>
      <span className="avatar" aria-hidden="true">
        {initialsOf(me.fullName)}
      </span>
      <span className="topbar__who">
        <span className="topbar__name">{me.fullName}</span>
        <span className="muted">{me.roles.map((role) => ROLE_LABELS[lang][role]).join(', ')}</span>
      </span>
    </div>
  );
}
