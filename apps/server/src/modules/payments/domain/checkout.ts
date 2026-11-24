import { LIMITS, type OrderStatus, type PaymentMethod } from '@cs/shared/vocabulary';

/**
 * When the car may be handed over and paid for (docs/PLAN.md, sections 9.1 and 11). Pure: the
 * order as it is now and what the admin entered arrive as arguments.
 */

export interface PaymentLine {
  method: PaymentMethod;
  amount: number;
}

export type CheckoutProblem =
  /** The order is not waiting to be picked up. */
  | 'invalid_transition'
  /** A zone that counts has no price yet. */
  | 'unpriced_items'
  /** The payments do not add up to the total. */
  | 'payment_mismatch'
  /** No receipt number, or one longer than the cash register prints. */
  | 'receipt_missing'
  /** A payment of nothing, or the same method twice. */
  | 'bad_payments';

/** The receipt number as it is kept: without the spaces around it. */
export const cleanReceiptNo = (value: string): string => value.trim();

/** The payments and the receipt alone: what a shop order's checkout checks too (stage 9). */
export function checkPayments(input: {
  total: number;
  payments: readonly PaymentLine[];
  receiptNo: string;
}): Exclude<CheckoutProblem, 'invalid_transition' | 'unpriced_items'> | null {
  const receipt = cleanReceiptNo(input.receiptNo);
  if (receipt.length < LIMITS.receiptNo.min || receipt.length > LIMITS.receiptNo.max) {
    return 'receipt_missing';
  }
  const methods = new Set(input.payments.map((line) => line.method));
  if (
    methods.size !== input.payments.length ||
    input.payments.some((line) => !Number.isSafeInteger(line.amount) || line.amount <= 0)
  ) {
    return 'bad_payments';
  }
  const paid = input.payments.reduce((sum, line) => sum + line.amount, 0);
  if (paid !== input.total) return 'payment_mismatch';
  return null;
}

export function checkCheckout(input: {
  status: OrderStatus;
  total: number;
  unpricedCount: number;
  payments: readonly PaymentLine[];
  receiptNo: string;
}): CheckoutProblem | null {
  if (input.status !== 'ready_for_pickup') return 'invalid_transition';
  if (input.unpricedCount > 0) return 'unpriced_items';
  return checkPayments(input);
}

/** The day's takings by method and the number of receipts (design A6, "Bugungi kassa"). */
export function cashSummary(
  payments: readonly PaymentLine[],
  receipts: number,
): { byMethod: Record<PaymentMethod, number>; total: number; receipts: number } {
  const byMethod: Record<PaymentMethod, number> = { cash: 0, card_terminal: 0, transfer: 0 };
  for (const line of payments) byMethod[line.method] += line.amount;
  return {
    byMethod,
    total: byMethod.cash + byMethod.card_terminal + byMethod.transfer,
    receipts,
  };
}
