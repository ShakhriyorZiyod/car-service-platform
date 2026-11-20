import { useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import './layout.css';
import { NewOrderWatcher } from './NewOrderWatcher';
import { Sidebar } from './Sidebar';
import { TelegramBack } from './TelegramBack';
import { Topbar } from './Topbar';

export function AppLayout() {
  // On a narrow screen (a phone, Telegram) the menu slides in over the page (layout.css). It is
  // open on the page where it was opened: going to another page closes it.
  const { pathname } = useLocation();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const menuOpen = openOn === pathname;

  return (
    <div className="layout">
      <NewOrderWatcher />
      <TelegramBack menuOpen={menuOpen} closeMenu={() => setOpenOn(null)} />
      <Sidebar open={menuOpen} onClose={() => setOpenOn(null)} />
      <div className="layout__main">
        <Topbar onMenu={() => setOpenOn(pathname)} />
        <div className="layout__page">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
