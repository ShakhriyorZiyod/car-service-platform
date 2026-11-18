/**
 * The clients module (docs/PLAN.md, sections 4.2 and 15; design A10): the list with its filters,
 * the card, clients entered by hand and erasing a client's personal data. It reads the tables and
 * writes through identity, garage and orders.
 */
import { createClientsService, type ClientsService, type ClientsServiceDeps } from './app/clients';

export function createClients(deps: ClientsServiceDeps): ClientsService {
  return createClientsService(deps);
}

export type { ClientsService } from './app/clients';
export { clientsAdminRoutes } from './http/routes';
