import type { Permission } from '@cs/shared/vocabulary';
import { useQuery } from '@tanstack/react-query';
import { Shield, X } from 'lucide-react';
import { NavLink } from 'react-router';
import { call } from '../api';
import { useCan } from '../auth/session';
import { useT, type Texts } from '../i18n';
import { WORKSHOP_KEY } from '../lib/keys';
import { Preferences, Who } from './Preferences';

/** The menu of docs/DESIGN.md (section 6); shop and warehouse come in v2. */
const NAV_ITEMS: readonly {
  to: string;
  label: keyof Texts['nav'];
  /** Shown when any of these is allowed. */
  permissions: readonly Permission[];
}[] = [
  { to: '/', label: 'today', permissions: ['today.read'] },
  { to: '/orders', label: 'orders', permissions: ['orders.read'] },
  { to: '/schedule', label: 'schedule', permissions: ['schedule.read'] },
  { to: '/tasks', label: 'tasks', permissions: ['tasks.review'] },
  { to: '/handover', label: 'handover', permissions: ['checkout.write'] },
  { to: '/clients', label: 'clients', permissions: ['clients.read'] },
  {
    to: '/settings',
    label: 'settings',
    permissions: ['settings.write', 'staff.manage', 'audit.read'],
  },
];

/** `open` and `onClose` matter on a narrow screen only, where the menu is a drawer. */
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const can = useCan();
  const workshop = useQuery({ queryKey: WORKSHOP_KEY, queryFn: () => call('admin.workshop') });
  return (
    <>
      {open && <div className="sidebar__backdrop" aria-hidden="true" onClick={onClose} />}
      <aside className={open ? 'sidebar is-open' : 'sidebar'}>
        <div className="sidebar__brand">
          <span className="sidebar__logo" aria-hidden="true">
            <Shield size={18} strokeWidth={2.2} />
          </span>
          <span className="sidebar__brand-text">
            <span className="section-title">{t.brand}</span>
            {workshop.data && <span className="muted sidebar__workshop">{workshop.data.name}</span>}
          </span>
          <button
            type="button"
            className="sidebar__close"
            aria-label={t.menu.close}
            title={t.menu.close}
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <nav className="sidebar__nav">
          {NAV_ITEMS.filter((item) => item.permissions.some(can)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => (isActive ? 'sidebar__item is-active' : 'sidebar__item')}
            >
              {t.nav[item.label]}
            </NavLink>
          ))}
        </nav>
        {/* On a narrow screen only (layout.css): what the top bar has no room for. */}
        <div className="sidebar__me">
          <Who className="sidebar__who" />
          <Preferences className="sidebar__prefs" />
        </div>
      </aside>
    </>
  );
}
