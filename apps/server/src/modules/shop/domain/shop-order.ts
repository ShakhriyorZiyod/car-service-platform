import {
  LIMITS,
  type ProductAvailability,
  type ShopOrderStatus,
  type ShopOrderTab,
} from '@cs/shared/vocabulary';

/**
 * Rules of the shop order (docs/PLAN.md, sections 9.5 and 11). Pure: the use cases ask these
 * questions of the order as it is now and write what they answer.
 */

export type ShopActor = 'client' | 'admin' | 'system';

/** Who may move an order from one status to another (section 9.5). */
const TRANSITIONS: Readonly<
  Record<ShopOrderStatus, Partial<Record<ShopOrderStatus, ShopActor[]>>>
> = {
  new: { confirmed: ['admin'], cancelled: ['client', 'admin', 'system'] },
  confirmed: { ready_for_pickup: ['admin'], cancelled: ['client', 'admin'] },
  ready_for_pickup: { completed: ['admin'], cancelled: ['admin', 'system'] },
  completed: {},
  cancelled: {},
};

export function canTransition(from: ShopOrderStatus, to: ShopOrderStatus, who: ShopActor): boolean {
  return TRANSITIONS[from][to]?.includes(who) ?? false;
}

/** While the order is not handed over or cancelled, its goods are held for it. */
export const holdsReserve = (status: ShopOrderStatus): boolean =>
  status === 'new' || status === 'confirmed' || status === 'ready_for_pickup';

/** A gathered order waits `settings.rules.shopPickupHours` calendar hours (PLAN 21, question 15). */
export const pickupUntilOf = (readyAt: Date, pickupHours: number): Date =>
  new Date(readyAt.getTime() + pickupHours * 3_600_000);

/** The system cancels a new order nobody confirmed in time, and a gathered one nobody came for. */
export function expiredReason(
  order: { status: ShopOrderStatus; holdUntil: Date | null; pickupUntil: Date | null },
  now: Date,
): 'no_contact' | 'not_picked_up' | null {
  if (order.status === 'new' && order.holdUntil !== null && now >= order.holdUntil) {
    return 'no_contact';
  }
  if (
    order.status === 'ready_for_pickup' &&
    order.pickupUntil !== null &&
    now >= order.pickupUntil
  ) {
    return 'not_picked_up';
  }
  return null;
}

/** The statuses each tab of the panel shows (design A9). */
export const TAB_STATUSES: Readonly<Record<ShopOrderTab, readonly ShopOrderStatus[]>> = {
  new: ['new'],
  confirmed: ['confirmed'],
  ready_for_pickup: ['ready_for_pickup'],
  done: ['completed', 'cancelled'],
};

/** What the panel may do with an order now: the server decides, the panel shows the buttons. */
export function staffActions(
  status: ShopOrderStatus,
  can: { write: boolean; checkout: boolean },
): {
  canCall: boolean;
  canReady: boolean;
  canCancel: boolean;
  canDiscount: boolean;
  canCheckout: boolean;
} {
  return {
    canCall: can.write && status === 'new',
    canReady: can.write && status === 'confirmed',
    canCancel: can.write && holdsReserve(status),
    canDiscount: can.checkout && holdsReserve(status),
    canCheckout: can.checkout && status === 'ready_for_pickup',
  };
}

export interface CartLine {
  productId: string;
  qty: number;
}

export interface ProductOffer {
  nameUz: string;
  nameRu: string;
  pack: string | null;
  sellPrice: number | null;
  onSale: boolean;
  free: number;
  availability: ProductAvailability;
  maxQty: number;
}

export type LineProblem = 'gone' | 'short';

/**
 * The cart priced by the price list now (section 11): every line with its price and total, and
 * what keeps it from being ordered — the product is no longer on sale, or less is free than asked.
 */
export function priceCart(
  lines: readonly CartLine[],
  offers: ReadonlyMap<string, ProductOffer>,
): {
  lines: (CartLine & {
    offer: ProductOffer | null;
    price: number;
    lineTotal: number;
    problem: LineProblem | null;
  })[];
  subtotal: number;
  canOrder: boolean;
} {
  const priced = lines.map((line) => {
    const offer = offers.get(line.productId) ?? null;
    const sellable = offer !== null && offer.onSale && offer.sellPrice !== null;
    const price = sellable ? (offer.sellPrice ?? 0) : 0;
    const problem: LineProblem | null = !sellable
      ? 'gone'
      : line.qty > offer.free || line.qty > LIMITS.cartQty.max
        ? 'short'
        : null;
    return { ...line, offer, price, lineTotal: price * line.qty, problem };
  });
  return {
    lines: priced,
    subtotal: priced.reduce((sum, line) => sum + (line.problem === 'gone' ? 0 : line.lineTotal), 0),
    canOrder: priced.length > 0 && priced.every((line) => line.problem === null),
  };
}

/** The same product twice in one cart counts as one line of both quantities. */
export function mergeLines(lines: readonly CartLine[]): CartLine[] {
  const byProduct = new Map<string, number>();
  for (const line of lines) {
    byProduct.set(line.productId, (byProduct.get(line.productId) ?? 0) + line.qty);
  }
  return [...byProduct].map(([productId, qty]) => ({ productId, qty }));
}
