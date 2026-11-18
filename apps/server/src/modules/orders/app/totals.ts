import { eq } from 'drizzle-orm';
import type { Tx } from '../../../db/client';
import { orderItems, orders } from '../../../db/schema';
import { AppError } from '../../../platform/errors';
import { subtotalOf, totalsAt } from '../domain/discount';

/**
 * The order's sums after its zones changed (docs/PLAN.md, section 11): the subtotal is added up
 * again from the zones that count, and the discount follows it. The caller holds the order's lock.
 */
export async function retotal(
  tx: Tx,
  orderId: string,
  now: Date,
): Promise<{ subtotal: number; discount: number; total: number }> {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new AppError('not_found');
  const items = await tx
    .select({ approval: orderItems.approval, price: orderItems.price })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  const sums = totalsAt(order, subtotalOf(items));
  await tx
    .update(orders)
    .set({
      subtotal: sums.subtotal,
      discountAmount: sums.discount,
      total: sums.total,
      updatedAt: now,
    })
    .where(eq(orders.id, orderId));
  return sums;
}
