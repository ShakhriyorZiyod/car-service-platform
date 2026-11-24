import { LIMITS } from '@cs/shared/vocabulary';
import { useEffect, useSyncExternalStore } from 'react';
import { readStored, writeStored } from '../telegram';

/**
 * The shop's cart (docs/PLAN.md, stage 9): only which products and how many. Prices, totals and
 * what can be ordered come from the server's quote. Kept in Telegram's CloudStorage, so it follows
 * the client to another device; outside Telegram, in the browser's storage.
 */

export interface CartLine {
  productId: string;
  qty: number;
}

const KEY = 'cs.cart.v1';

let lines: readonly CartLine[] = [];
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: readonly CartLine[]): void {
  lines = next;
  for (const listener of listeners) listener();
  void writeStored(KEY, next.length === 0 ? null : JSON.stringify(next));
}

function parse(raw: string | null): CartLine[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (line): line is CartLine =>
          typeof line === 'object' &&
          line !== null &&
          typeof (line as CartLine).productId === 'string' &&
          Number.isInteger((line as CartLine).qty) &&
          (line as CartLine).qty > 0,
      )
      .slice(0, LIMITS.cartLines.max);
  } catch {
    return [];
  }
}

/** Reads the stored cart once; changes made before it arrives win over it. */
function load(): Promise<void> {
  loading ??= readStored(KEY).then((raw) => {
    if (lines.length > 0) return;
    lines = parse(raw);
    for (const listener of listeners) listener();
  });
  return loading;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => lines;

export function useCart() {
  const current = useSyncExternalStore(subscribe, snapshot);
  useEffect(() => {
    void load();
  }, []);
  return {
    lines: current,
    count: current.reduce((sum, line) => sum + line.qty, 0),
    qtyOf: (productId: string) => current.find((line) => line.productId === productId)?.qty ?? 0,
    /** Sets a product's quantity; 0 takes it out. The server checks the limits again. */
    set(productId: string, qty: number) {
      const capped = Math.max(0, Math.min(qty, LIMITS.cartQty.max));
      const rest = lines.filter((line) => line.productId !== productId);
      if (capped === 0) return publish(rest);
      const existing = lines.findIndex((line) => line.productId === productId);
      if (existing === -1) {
        if (lines.length >= LIMITS.cartLines.max) return;
        return publish([...lines, { productId, qty: capped }]);
      }
      publish(
        lines.map((line) => (line.productId === productId ? { productId, qty: capped } : line)),
      );
    },
    clear: () => publish([]),
  };
}
