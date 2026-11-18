import { createBrowserRouter } from 'react-router';
import { AuditTab } from './features/settings/AuditTab';
import { SettingsIndex, SettingsPage, SettingsPending } from './features/settings/SettingsPage';
import { StaffTab } from './features/settings/StaffTab';
import { useT, type Texts } from './i18n';
import { AppLayout } from './layout/AppLayout';
import { ComingSoon } from './ui/ComingSoon';

/** A section that a later stage builds, with the stage of docs/PLAN.md section 18. */
function Pending({ section, stage }: { section: keyof Texts['nav']; stage: number }) {
  const t = useT();
  return <ComingSoon title={t.nav[section]} stage={stage} />;
}

function NotFound() {
  const t = useT();
  return <p className="muted">{t.notFound}</p>;
}

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <AppLayout />,
      children: [
        { index: true, element: <Pending section="today" stage={4} /> },
        { path: 'orders', element: <Pending section="orders" stage={4} /> },
        { path: 'schedule', element: <Pending section="schedule" stage={4} /> },
        { path: 'tasks', element: <Pending section="tasks" stage={5} /> },
        { path: 'handover', element: <Pending section="handover" stage={6} /> },
        { path: 'clients', element: <Pending section="clients" stage={4} /> },
        {
          path: 'settings',
          element: <SettingsPage />,
          children: [
            { index: true, element: <SettingsIndex /> },
            { path: 'prices', element: <SettingsPending tab="prices" /> },
            { path: 'boxes', element: <SettingsPending tab="boxes" /> },
            { path: 'hours', element: <SettingsPending tab="hours" /> },
            { path: 'brands', element: <SettingsPending tab="brands" /> },
            { path: 'staff', element: <StaffTab /> },
            { path: 'audit', element: <AuditTab /> },
          ],
        },
        { path: '*', element: <NotFound /> },
      ],
    },
  ],
  { basename: '/admin' },
);
