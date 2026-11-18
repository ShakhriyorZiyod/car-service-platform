import type { FiscalProvider as FiscalProviderName, FiscalStatus } from '@cs/shared/vocabulary';

/**
 * The fiscal receipt port (docs/PLAN.md, section 11). In v1 the admin prints the receipt on the
 * workshop's own online cash register and types its number; a cash register API (v2) implements
 * the same port and may answer `pending`, to be finished by a retry job.
 */

export interface FiscalRequest {
  orderId: string;
  amount: number;
  /** The checkout's key, so a retried request never prints a second receipt. */
  requestId: string;
  /** The number the admin typed (manual provider). */
  receiptNo: string;
}

export interface FiscalResult {
  provider: FiscalProviderName;
  status: FiscalStatus;
  receiptNo: string;
  fiscalSign: string | null;
  receiptUrl: string | null;
}

export interface FiscalProvider {
  issue(request: FiscalRequest): Promise<FiscalResult>;
}

/** The receipt was printed by hand: its number is all there is. */
export function createManualFiscalProvider(): FiscalProvider {
  return {
    issue: (request) =>
      Promise.resolve({
        provider: 'manual',
        status: 'done',
        receiptNo: request.receiptNo,
        fiscalSign: null,
        receiptUrl: null,
      }),
  };
}
