/**
 * The reception module (docs/PLAN.md, sections 4.2, 7.9 and 9.4): the act of taking the car in with
 * its defects and photos, the client's confirmation (in the app or the bot, or the admin's note of
 * a verbal one) and handing the order to work.
 */
import { createReceptionService, type ReceptionDeps, type ReceptionService } from './app/reception';

export function createReception(deps: ReceptionDeps): ReceptionService {
  return createReceptionService(deps);
}

export type { ReceptionService } from './app/reception';
export { receptionBotHandlers } from './bot/handlers';
export { receptionAdminRoutes, receptionClientRoutes } from './http/routes';
