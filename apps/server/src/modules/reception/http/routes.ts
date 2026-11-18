import type { AdminRoutes, ClientRoutes } from '../../../http/contexts';
import type { ReceptionService } from '../app/reception';

/** Thin adapters: each handler only passes the validated input to a use case. */

export const receptionAdminRoutes = (
  reception: ReceptionService,
): Pick<
  AdminRoutes,
  | 'admin.act'
  | 'admin.saveAct'
  | 'admin.putActPhoto'
  | 'admin.sendAct'
  | 'admin.confirmActVerbal'
  | 'admin.startWork'
> => ({
  'admin.act': ({ params }, { actor }) => reception.get(actor, params.id),
  'admin.saveAct': ({ params, body }, { actor }) => reception.save(actor, params.id, body),
  'admin.putActPhoto': ({ params, query, body }, { actor }) =>
    reception.putPhoto(actor, params.id, {
      mediaId: params.mediaId,
      purpose: query.purpose,
      side: query.side,
      bytes: body,
    }),
  'admin.sendAct': ({ params }, { actor, ip }) => reception.send(actor, params.id, ip),
  'admin.confirmActVerbal': ({ params }, { actor, ip }) =>
    reception.confirmVerbal(actor, params.id, ip),
  'admin.startWork': ({ params }, { actor, ip }) => reception.startWork(actor, params.id, ip),
});

export const receptionClientRoutes = (
  reception: ReceptionService,
): Pick<ClientRoutes, 'client.act' | 'client.confirmAct'> => ({
  'client.act': ({ params }, { actor }) => reception.forClient(actor, params.id),
  'client.confirmAct': ({ params }, { actor }) =>
    reception.confirmByClient(actor, params.id, 'tma'),
});
