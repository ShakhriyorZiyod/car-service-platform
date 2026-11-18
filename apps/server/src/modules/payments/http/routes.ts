import type { AdminRoutes, ClientRoutes } from '../../../http/contexts';
import type { PaymentsService } from '../app/payments';

/** Thin adapters: each handler only passes the validated input to a use case. */

export const paymentsAdminRoutes = (
  payments: PaymentsService,
): Pick<AdminRoutes, 'admin.handover' | 'admin.checkout' | 'admin.correctPayment'> => ({
  'admin.handover': ({ params }, { actor }) => payments.handover(actor, params.id),
  'admin.checkout': ({ params, body }, { actor, ip }) =>
    payments.checkout(actor, params.id, body, ip),
  'admin.correctPayment': ({ params, body }, { actor, ip }) =>
    payments.correctMethod(actor, params.id, body.method, ip),
});

export const paymentsClientRoutes = (
  payments: PaymentsService,
): Pick<ClientRoutes, 'client.orderResult'> => ({
  'client.orderResult': ({ params }, { actor }) => payments.resultForClient(actor, params.id),
});
