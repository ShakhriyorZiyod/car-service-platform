import { LANG_NAMES, LANGS, ROLE_LABELS } from '@cs/shared/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, Search } from 'lucide-react';
import { call } from '../api';
import { useMe, useSetMe } from '../auth/session';
import { useLang, useT } from '../i18n';
import { Button } from '../ui/Button';

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

  const changeLang = useMutation({
    mutationFn: (next: (typeof LANGS)[number]) => call('auth.updateMe', { body: { lang: next } }),
    onSuccess: setMe,
  });
  const signOut = useMutation({
    mutationFn: () => call('auth.logout'),
    onSettled: () => {
      queryClient.clear();
      setMe(null);
    },
  });

  return (
    <header className="topbar">
      <label className="topbar__search">
        <Search size={16} aria-hidden="true" />
        <input type="search" placeholder={t.search} disabled />
      </label>
      <div className="topbar__user">
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
          busy={signOut.isPending}
          onClick={() => signOut.mutate()}
        >
          {t.signOut}
        </Button>
      </div>
    </header>
  );
}
