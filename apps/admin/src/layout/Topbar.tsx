import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, Menu, Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { call } from '../api';
import { ME_KEY, useCan, useSetMe } from '../auth/session';
import { useT } from '../i18n';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Preferences, Who } from './Preferences';

/**
 * Search (stage 4); who is signed in, their mode and language, and signing out. On a narrow screen
 * the mode, the language and the name move into the menu (layout.css): one row stays here.
 */
export function Topbar({ onMenu }: { onMenu: () => void }) {
  const t = useT();
  const setMe = useSetMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [confirmingExit, setConfirmingExit] = useState(false);
  const can = useCan();

  // The search finds orders: by number, the client's name or phone, or the plate. A number may
  // be a shop order's (they share the numbers): then it opens on the shop's page.
  const search = async (event: FormEvent) => {
    event.preventDefault();
    const q = text.trim();
    if (/^№?\d{1,7}$/.test(q) && can('shop.read')) {
      const found = await call('admin.shopOrders', { query: { tab: 'new', q } }).catch(() => null);
      const order = found?.items[0];
      if (order) {
        const tab =
          order.status === 'completed' || order.status === 'cancelled' ? 'done' : order.status;
        void navigate(`/shop?tab=${tab}&order=${order.id}`);
        return;
      }
    }
    void navigate(q ? `/orders?q=${encodeURIComponent(q)}` : '/orders');
  };

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
      <button
        type="button"
        className="topbar__menu"
        aria-label={t.menu.open}
        title={t.menu.open}
        onClick={onMenu}
      >
        <Menu size={20} aria-hidden="true" />
      </button>
      <form className="topbar__search" role="search" onSubmit={(event) => void search(event)}>
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
        <Preferences className="topbar__prefs" />
        <Who className="topbar__me" />
        <Button
          variant="ghost"
          className="topbar__exit"
          icon={<LogOut size={16} aria-hidden="true" />}
          aria-label={t.signOut}
          title={t.signOut}
          onClick={() => setConfirmingExit(true)}
        >
          <span className="topbar__exit-text">{t.signOut}</span>
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
