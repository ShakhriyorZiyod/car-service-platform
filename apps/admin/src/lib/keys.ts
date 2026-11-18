/** Query keys the panel shares between screens, so one can refresh what another showed. */

/** The workshop's name, address and phone: any staff member reads them (the sidebar shows the name). */
export const WORKSHOP_KEY = ['workshop'] as const;

/** Kinds of work: the price list's tabs and the boxes' abilities read the same list. */
export const SERVICE_TYPES_KEY = ['service-types'] as const;

/** Brands with their models: the brands screen edits them, the price list shows examples from them. */
export const BRANDS_KEY = ['brands'] as const;

/** Orders in progress, for the board and for the sound that tells of a new one. */
export const ORDERS_KEY = ['orders'] as const;
export const orderKey = (id: string) => ['order', id] as const;
export const TODAY_KEY = ['today'] as const;
export const SCHEDULE_KEY = ['schedule'] as const;
export const CLIENTS_KEY = ['clients'] as const;
export const clientKey = (id: string) => ['client', id] as const;
export const UNMAPPED_CARS_KEY = ['cars', 'unmapped'] as const;

/** Zones, brands and cancel reasons as the staff pick them when they enter or change an order. */
export const CATALOG_KEY = ['catalog'] as const;
export const CANCEL_REASONS_KEY = ['cancel-reasons'] as const;

/** How often the screens ask again (docs/PLAN.md, stage 4: the panel refreshes every 10 seconds). */
export const POLL_MS = 10_000;

/** An order's reception act, the masters' tasks and the masters themselves. */
export const actKey = (orderId: string) => ['act', orderId] as const;
export const TASKS_KEY = ['tasks'] as const;
export const taskKey = (id: string) => ['task', id] as const;
export const MASTERS_KEY = ['masters'] as const;

/** The handover of an order: the act of the work done, the payment and the receipt (stage 6). */
export const handoverKey = (orderId: string) => ['handover', orderId] as const;
