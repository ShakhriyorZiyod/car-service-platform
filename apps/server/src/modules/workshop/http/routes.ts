import type { AdminRoutes } from '../../../http/contexts';
import type { BoxesService } from '../app/boxes';
import type { HoursService } from '../app/hours';
import type { SettingsService } from '../app/settings';

/** Thin adapters: each handler only passes the validated input to a use case. */

export const workshopAdminRoutes = (services: {
  settings: SettingsService;
  hours: HoursService;
  boxes: BoxesService;
}): Pick<
  AdminRoutes,
  | 'admin.workshop'
  | 'admin.settings'
  | 'admin.updateSettings'
  | 'admin.workHours'
  | 'admin.updateWorkHours'
  | 'admin.addHoliday'
  | 'admin.removeHoliday'
  | 'admin.boxes'
  | 'admin.createBox'
  | 'admin.updateBox'
> => {
  const { settings, hours, boxes } = services;
  return {
    'admin.workshop': (_input, { actor }) => settings.panelInfo(actor),
    'admin.settings': (_input, { actor }) => settings.get(actor),
    'admin.updateSettings': ({ body }, { actor, ip }) => settings.update(actor, body, ip),

    'admin.workHours': (_input, { actor }) => hours.get(actor),
    'admin.updateWorkHours': ({ body }, { actor, ip }) => hours.replaceWeek(actor, body.days, ip),
    'admin.addHoliday': ({ body }, { actor, ip }) => hours.addHoliday(actor, body, ip),
    'admin.removeHoliday': async ({ params }, { actor, ip }) => {
      await hours.removeHoliday(actor, params.date, ip);
      return { ok: true };
    },

    'admin.boxes': async (_input, { actor }) => ({ items: await boxes.list(actor) }),
    'admin.createBox': ({ body }, { actor, ip }) => boxes.create(actor, body, ip),
    'admin.updateBox': ({ params, body }, { actor, ip }) =>
      boxes.update(actor, params.id, body, ip),
  };
};
