import type { AdminRoutes, ClientRoutes } from '../../../http/contexts';
import type { ExtrasService } from '../app/extras';

/** Thin adapters: each handler only passes the validated input to a use case. */

export const extrasAdminRoutes = (
  extras: ExtrasService,
): Pick<AdminRoutes, 'admin.addExtraItem' | 'admin.decideExtraItem'> => ({
  'admin.addExtraItem': ({ params, body }, { actor, ip }) => extras.add(actor, params.id, body, ip),
  'admin.decideExtraItem': ({ params, body }, { actor, ip }) =>
    extras.decideByPhone(actor, params.id, params.itemId, body.decision, ip),
});

export const extrasClientRoutes = (
  extras: ExtrasService,
): Pick<ClientRoutes, 'client.decideExtra'> => ({
  'client.decideExtra': ({ params, body }, { actor }) =>
    extras.decideAsClient(
      actor,
      params.itemId,
      body.decision === 'approve' ? 'approved' : 'rejected',
      'tma',
      params.id,
    ),
});
