import type { Permission } from '@cs/shared/vocabulary';
import { Navigate, NavLink, Outlet } from 'react-router';
import { useCan } from '../../auth/session';
import { useT, type Texts } from '../../i18n';
import './settings.css';

type TabKey = keyof Texts['settings']['tabs'];

/** The owner's settings (design A12, A13); each tab is its own chunk (see router.tsx). */
const TABS: readonly { key: TabKey; permission: Permission }[] = [
  { key: 'prices', permission: 'settings.write' },
  { key: 'boxes', permission: 'settings.write' },
  { key: 'hours', permission: 'settings.write' },
  { key: 'brands', permission: 'settings.write' },
  { key: 'workshop', permission: 'settings.write' },
  { key: 'staff', permission: 'staff.manage' },
  { key: 'audit', permission: 'audit.read' },
  { key: 'products', permission: 'products.write' },
];

export function SettingsPage() {
  const t = useT();
  const can = useCan();
  return (
    <section className="settings">
      <h1 className="page-title">{t.settings.title}</h1>
      <nav className="settings__tabs">
        {TABS.filter((tab) => can(tab.permission)).map((tab) => (
          <NavLink
            key={tab.key}
            to={tab.key}
            className={({ isActive }) => (isActive ? 'settings__tab is-active' : 'settings__tab')}
          >
            {t.settings.tabs[tab.key]}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </section>
  );
}

/** /settings opens the first tab this role may see. */
export function SettingsIndex() {
  const can = useCan();
  const first = TABS.find((tab) => can(tab.permission));
  return first ? <Navigate to={first.key} replace /> : null;
}
