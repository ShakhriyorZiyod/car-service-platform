import type { AdminRoutes } from '../../../http/contexts';
import type { ClientsService } from '../app/clients';

/** Thin adapters: each handler only passes the validated input to a use case. */

export const clientsAdminRoutes = (
  clients: ClientsService,
): Pick<
  AdminRoutes,
  | 'admin.clients'
  | 'admin.createClient'
  | 'admin.client'
  | 'admin.updateClient'
  | 'admin.createClientCar'
  | 'admin.anonymizeClient'
> => ({
  'admin.clients': ({ query }, { actor }) => clients.list(actor, query),
  'admin.createClient': ({ body }, { actor, ip }) => clients.create(actor, body, ip),
  'admin.client': ({ params }, { actor }) => clients.get(actor, params.id),
  'admin.updateClient': ({ params, body }, { actor, ip }) =>
    clients.update(actor, params.id, body, ip),
  'admin.createClientCar': ({ params, body }, { actor }) => clients.addCar(actor, params.id, body),
  'admin.anonymizeClient': ({ params }, { actor, ip }) => clients.anonymize(actor, params.id, ip),
});
