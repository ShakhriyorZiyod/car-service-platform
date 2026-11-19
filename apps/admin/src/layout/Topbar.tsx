import { LANG_NAMES, LANGS, ROLE_LABELS } from '@cs/shared/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, Monitor, Moon, Search, Sun } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { call } from '../api';
import { ME_KEY, useCan, useMe, useSetMe } from '../auth/session';
import { useLang, useT } from '../i18n';
import { chooseTheme, THEME_CHOICES, useThemeChoice } from '../lib/theme';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';

const THEME_ICONS = { auto: Monitor, light: Sun, dark: Moon } as const;

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

/** Search (stage 4); who is signed in, their language and signing out. */
export function Topbar() {
  const t = useT();
  const lang = useLang();
  const me = useMe();
  const setMe = useSetMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [confirmingExit, setConfirmingExit] = useState(false);
  const can = useCan();
  const theme = useThemeChoice();

  // The search finds orders: by number, the client's name or phone, or the plate.
  const search = (event: FormEvent) => {
    event.preventDefault();
    const q = text.trim();
    void navigate(q ? `/orders?q=${encodeURIComponent(q)}` : '/orders');
  };

  const changeLang = useMutation({
    mutationFn: (next: (typeof LANGS)[number]) => call('auth.updateMe', { body: { lang: next } }),
    onSuccess: setMe,
  });
  const signOut = useMutation({
    mutationFn: () => call('auth.logout'),
    // Only once the server has ended the session. The sign-in screen comes first: `me` becomes
    // null in the very query the panel watches. Clearing the whole cache before that removed
    // this query from under the panel, which then never saw the change and stayed open.
    onSuccess: () => {
      setMe(null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_KEY[0] });
    },
  });

  return (
    <header className="topbar">
      <form className="topbar__search" role="search" onSubmit={search}>
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          placeholder={t.search}
          aria-label={t.search}
          disabled={!can('orders.read')}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </form>
      <div className="topbar__user">
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
        <span className="avatar" aria-hidden="true">
          {initialsOf(me.fullName)}
        </span>
        <span className="topbar__who">
          <span className="topbar__name">{me.fullName}</span>
          <span className="muted">
            {me.roles.map((role) => ROLE_LABELS[lang][role]).join(', ')}
          </span>
        </span>
        <Button
          variant="ghost"
          icon={<LogOut size={16} aria-hidden="true" />}
          onClick={() => setConfirmingExit(true)}
        >
          {t.signOut}
        </Button>
      </div>
      {confirmingExit && (
        <ConfirmDialog
          title={t.signOutConfirm.title}
          confirmLabel={t.signOut}
          pending={signOut.isPending}
          error={signOut.error}
          onConfirm={() => signOut.mutate()}
          onClose={() => {
            setConfirmingExit(false);
            signOut.reset();
          }}
        >
          <p>{t.signOutConfirm.text}</p>
        </ConfirmDialog>
      )}
    </header>
  );
}
