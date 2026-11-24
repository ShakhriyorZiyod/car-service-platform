import type { ShopOrderStatus } from '@cs/shared/vocabulary';
import { describe, expect, it } from 'vitest';
import {
  canTransition,
  expiredReason,
  mergeLines,
  pickupUntilOf,
  priceCart,
  staffActions,
  type ProductOffer,
  type ShopActor,
} from '../../../src/modules/shop/domain/shop-order';

describe('shop order transitions (PLAN 9.5)', () => {
  it.each<[ShopOrderStatus, ShopOrderStatus, ShopActor, boolean]>([
    ['new', 'confirmed', 'admin', true],
    ['new', 'confirmed', 'client', false],
    ['new', 'cancelled', 'client', true],
    ['new', 'cancelled', 'admin', true],
    ['new', 'cancelled', 'system', true],
    ['new', 'ready_for_pickup', 'admin', false],
    ['new', 'completed', 'admin', false],
    ['confirmed', 'ready_for_pickup', 'admin', true],
    ['confirmed', 'cancelled', 'client', true],
    ['confirmed', 'cancelled', 'admin', true],
    ['confirmed', 'cancelled', 'system', false],
    ['confirmed', 'completed', 'admin', false],
    ['ready_for_pickup', 'completed', 'admin', true],
    ['ready_for_pickup', 'cancelled', 'client', false],
    ['ready_for_pickup', 'cancelled', 'admin', true],
    ['ready_for_pickup', 'cancelled', 'system', true],
    ['completed', 'cancelled', 'admin', false],
    ['cancelled', 'new', 'admin', false],
  ])('%s → %s by %s: %s', (from, to, who, allowed) => {
    expect(canTransition(from, to, who)).toBe(allowed);
  });
});

describe('when the system cancels by itself', () => {
  const now = new Date('2026-10-29T10:00:00Z');
  const before = new Date('2026-10-29T09:59:59Z');
  const after = new Date('2026-10-29T10:00:01Z');
  it.each([
    [{ status: 'new' as const, holdUntil: before, pickupUntil: null }, 'no_contact'],
    [{ status: 'new' as const, holdUntil: now, pickupUntil: null }, 'no_contact'],
    [{ status: 'new' as const, holdUntil: after, pickupUntil: null }, null],
    [{ status: 'new' as const, holdUntil: null, pickupUntil: null }, null],
    [{ status: 'confirmed' as const, holdUntil: before, pickupUntil: before }, null],
    [
      { status: 'ready_for_pickup' as const, holdUntil: null, pickupUntil: before },
      'not_picked_up',
    ],
    [{ status: 'ready_for_pickup' as const, holdUntil: null, pickupUntil: after }, null],
    [{ status: 'completed' as const, holdUntil: before, pickupUntil: before }, null],
  ])('%o → %s', (order, reason) => {
    expect(expiredReason(order, now)).toBe(reason);
  });

  it('a gathered order waits the hours of the settings, calendar hours', () => {
    expect(pickupUntilOf(new Date('2026-10-29T10:00:00Z'), 72).toISOString()).toBe(
      '2026-11-01T10:00:00.000Z',
    );
  });
});

describe('what the panel may do', () => {
  it.each<[ShopOrderStatus, Record<string, boolean>]>([
    [
      'new',
      { canCall: true, canReady: false, canCancel: true, canDiscount: true, canCheckout: false },
    ],
    [
      'confirmed',
      { canCall: false, canReady: true, canCancel: true, canDiscount: true, canCheckout: false },
    ],
    [
      'ready_for_pickup',
      { canCall: false, canReady: false, canCancel: true, canDiscount: true, canCheckout: true },
    ],
    [
      'completed',
      { canCall: false, canReady: false, canCancel: false, canDiscount: false, canCheckout: false },
    ],
    [
      'cancelled',
      { canCall: false, canReady: false, canCancel: false, canDiscount: false, canCheckout: false },
    ],
  ])('%s', (status, actions) => {
    expect(staffActions(status, { write: true, checkout: true })).toEqual(actions);
  });

  it('without the permissions there are no buttons', () => {
    expect(
      Object.values(staffActions('ready_for_pickup', { write: false, checkout: false })),
    ).toEqual([false, false, false, false, false]);
  });
});

describe('the cart priced by the server (PLAN 11)', () => {
  const offer = (over: Partial<ProductOffer> = {}): ProductOffer => ({
    nameUz: 'Shampun',
    nameRu: 'Шампунь',
    pack: '1 l',
    sellPrice: 85_000,
    onSale: true,
    free: 5,
    availability: 'in_stock',
    maxQty: 5,
    ...over,
  });

  it('prices every line by the price list now', () => {
    const offers = new Map([
      ['a', offer()],
      ['b', offer({ sellPrice: 12_000 })],
    ]);
    const cart = priceCart(
      [
        { productId: 'a', qty: 2 },
        { productId: 'b', qty: 3 },
      ],
      offers,
    );
    expect(cart.subtotal).toBe(2 * 85_000 + 3 * 12_000);
    expect(cart.canOrder).toBe(true);
    expect(cart.lines.map((line) => line.problem)).toEqual([null, null]);
  });

  it.each([
    ['not on sale any more', offer({ onSale: false }), 1, 'gone'],
    ['no price', offer({ sellPrice: null }), 1, 'gone'],
    ['less free than asked', offer({ free: 1 }), 2, 'short'],
    ['out of stock', offer({ free: 0, availability: 'out' }), 1, 'short'],
    ['over the cart limit', offer({ free: 100 }), 11, 'short'],
  ])('%s: %s', (_name, given, qty, problem) => {
    const cart = priceCart([{ productId: 'a', qty }], new Map([['a', given]]));
    expect(cart.lines[0]?.problem).toBe(problem);
    expect(cart.canOrder).toBe(false);
  });

  it('a product that does not exist is gone and adds nothing', () => {
    const cart = priceCart([{ productId: 'x', qty: 1 }], new Map());
    expect(cart.lines[0]?.problem).toBe('gone');
    expect(cart.subtotal).toBe(0);
  });

  it('an empty cart cannot be ordered', () => {
    expect(priceCart([], new Map()).canOrder).toBe(false);
  });

  it('the same product twice is one line', () => {
    expect(
      mergeLines([
        { productId: 'a', qty: 1 },
        { productId: 'b', qty: 2 },
        { productId: 'a', qty: 3 },
      ]),
    ).toEqual([
      { productId: 'a', qty: 4 },
      { productId: 'b', qty: 2 },
    ]);
  });
});
