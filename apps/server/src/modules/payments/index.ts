/**
 * The payments module (docs/PLAN.md, sections 4.2, 7.12 and 11): the handover, checkout with the
 * fiscal receipt, the owner's correction of a payment method, and the day's takings.
 */
import { createPaymentsService, type PaymentsDeps, type PaymentsService } from './app/payments';

export function createPayments(deps: PaymentsDeps): PaymentsService {
  return createPaymentsService(deps);
}

export { createManualFiscalProvider, type FiscalProvider } from './app/fiscal';
export type { PaymentsService } from './app/payments';
export { paymentsAdminRoutes, paymentsClientRoutes } from './http/routes';
