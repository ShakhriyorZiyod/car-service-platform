import type { ComponentType } from 'react';
import { createBrowserRouter } from 'react-router';
import { useT } from './i18n';
import { AppLayout } from './layout/AppLayout';

function NotFound() {
  const t = useT();
  return <p className="muted">{t.notFound}</p>;
}

/** A screen loads when it is opened, so the first screen stays small. */
const screen = (load: () => Promise<{ Component: ComponentType }>) => ({ lazy: load });

/**
 * The settings load on demand (CLAUDE.md, "Admin"): the owner alone opens them, and every tab is
 * a chunk of its own, so the panel's first screen stays small.
 */
const settingsRoute = (path: string, load: () => Promise<{ Component: ComponentType }>) => ({
  path,
  lazy: load,
});

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <AppLayout />,
      children: [
        {
          index: true,
          ...screen(async () => ({
            Component: (await import('./features/today/TodayPage')).TodayPage,
          })),
        },
        {
          path: 'orders',
          ...screen(async () => ({
            Component: (await import('./features/orders/OrdersPage')).OrdersPage,
          })),
        },
        {
          path: 'orders/new',
          ...screen(async () => ({
            Component: (await import('./features/new-order/NewOrderPage')).NewOrderPage,
          })),
        },
        {
          path: 'orders/:id/act',
          ...screen(async () => ({
            Component: (await import('./features/reception/ReceptionPage')).ReceptionPage,
          })),
        },
        {
          path: 'orders/:id',
          ...screen(async () => ({
            Component: (await import('./features/order/OrderPage')).OrderPage,
          })),
        },
        {
          path: 'schedule',
          ...screen(async () => ({
            Component: (await import('./features/schedule/SchedulePage')).SchedulePage,
          })),
        },
        {
          path: 'tasks',
          ...screen(async () => ({
            Component: (await import('./features/tasks/TasksPage')).TasksPage,
          })),
        },
        {
          path: 'tasks/:id',
          ...screen(async () => ({
            Component: (await import('./features/tasks/TaskPage')).TaskPage,
          })),
        },
        {
          path: 'handover',
          ...screen(async () => ({
            Component: (await import('./features/handover/HandoverListPage')).HandoverListPage,
          })),
        },
        {
          path: 'orders/:id/handover',
          ...screen(async () => ({
            Component: (await import('./features/handover/HandoverPage')).HandoverPage,
          })),
        },
        {
          path: 'clients',
          ...screen(async () => ({
            Component: (await import('./features/clients/ClientsPage')).ClientsPage,
          })),
        },
        {
          path: 'clients/:id',
          ...screen(async () => ({
            Component: (await import('./features/clients/ClientPage')).ClientPage,
          })),
        },
        {
          path: 'settings',
          lazy: async () => ({
            Component: (await import('./features/settings/SettingsPage')).SettingsPage,
          }),
          children: [
            {
              index: true,
              lazy: async () => ({
                Component: (await import('./features/settings/SettingsPage')).SettingsIndex,
              }),
            },
            settingsRoute('prices', async () => ({
              Component: (await import('./features/settings/PricesTab')).PricesTab,
            })),
            settingsRoute('boxes', async () => ({
              Component: (await import('./features/settings/BoxesTab')).BoxesTab,
            })),
            settingsRoute('hours', async () => ({
              Component: (await import('./features/settings/HoursTab')).HoursTab,
            })),
            settingsRoute('brands', async () => ({
              Component: (await import('./features/settings/BrandsTab')).BrandsTab,
            })),
            settingsRoute('workshop', async () => ({
              Component: (await import('./features/settings/WorkshopTab')).WorkshopTab,
            })),
            settingsRoute('staff', async () => ({
              Component: (await import('./features/settings/StaffTab')).StaffTab,
            })),
            settingsRoute('audit', async () => ({
              Component: (await import('./features/settings/AuditTab')).AuditTab,
            })),
          ],
        },
        { path: '*', element: <NotFound /> },
      ],
    },
  ],
  { basename: '/admin' },
);
