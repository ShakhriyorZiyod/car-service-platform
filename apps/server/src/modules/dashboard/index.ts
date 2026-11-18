/**
 * The dashboard module (docs/PLAN.md, section 4.2): the "Bugun" screen. It reads only, through the
 * services of the modules that own the data.
 */
import { createDashboardService, type DashboardDeps, type DashboardService } from './app/dashboard';

export function createDashboard(deps: DashboardDeps): DashboardService {
  return createDashboardService(deps);
}

export type { DashboardService } from './app/dashboard';
export { dashboardAdminRoutes } from './http/routes';
