/**
 * The workshop module (docs/PLAN.md, sections 4.2 and 7.4): its settings and rules, working hours
 * and holidays, boxes, and the working-time arithmetic that every other module asks.
 */
import type { PlatformDeps } from '../../platform/deps';
import type { AuditService } from '../audit';
import { createBoxesService, type BoxesService } from './app/boxes';
import { createHoursService, type HoursService } from './app/hours';
import { createSettingsService, type SettingsService } from './app/settings';

export interface WorkshopDeps extends PlatformDeps {
  audit: AuditService;
}

export interface WorkshopService {
  settings: SettingsService;
  hours: HoursService;
  boxes: BoxesService;
}

export function createWorkshopService(deps: WorkshopDeps): WorkshopService {
  return {
    settings: createSettingsService(deps),
    hours: createHoursService(deps),
    boxes: createBoxesService(deps),
  };
}

export type { BoxesService } from './app/boxes';
export type { HoursService } from './app/hours';
export type { SettingsService } from './app/settings';
export { DEFAULT_SETTINGS } from './domain/settings';
export {
  addWorkMinutes,
  createWorkTime,
  longestWorkdayMinutes,
  workIntervals,
  workMinutesBetween,
  type WorkCalendar,
} from './domain/working-time';
export { workshopAdminRoutes } from './http/routes';
