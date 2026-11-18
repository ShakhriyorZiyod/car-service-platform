import type { AdminRoutes } from '../../../http/contexts';
import type { DashboardService } from '../app/dashboard';

/** Thin adapters: each handler only passes the validated input to a use case. */

export const dashboardAdminRoutes = (
  dashboard: DashboardService,
): Pick<AdminRoutes, 'admin.today'> => ({
  'admin.today': (_input, { actor }) => dashboard.today(actor),
});
