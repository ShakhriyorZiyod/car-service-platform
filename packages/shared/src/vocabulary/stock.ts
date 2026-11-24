/**
 * Words of the warehouse (docs/PLAN.md, sections 7.14 and 9.6). The database enums repeat these
 * values.
 */

/** What a product is counted in. Goods for sale are always counted in pieces. */
export const PRODUCT_UNITS = ['pcs', 'ml', 'l', 'kg', 'm', 'm2'] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

/** A document is the only thing that changes the stock (TZ 8.2). `sale` is made by the shop. */
export const STOCK_DOCUMENT_KINDS = ['receipt', 'write_off', 'inventory', 'sale'] as const;
export type StockDocumentKind = (typeof STOCK_DOCUMENT_KINDS)[number];

/** The kinds a person writes by hand in the panel. */
export const MANUAL_DOCUMENT_KINDS = [
  'receipt',
  'write_off',
  'inventory',
] as const satisfies readonly StockDocumentKind[];
export type ManualDocumentKind = (typeof MANUAL_DOCUMENT_KINDS)[number];

/** A draft can be edited and deleted; a posted document has changed the stock and stays as it is. */
export const STOCK_DOCUMENT_STATUSES = ['draft', 'posted'] as const;
export type StockDocumentStatus = (typeof STOCK_DOCUMENT_STATUSES)[number];

/** Why goods are written off (TZ 8.2: a reason is required). */
export const WRITE_OFF_REASONS = ['defect', 'expired', 'internal', 'other'] as const;
export type WriteOffReason = (typeof WRITE_OFF_REASONS)[number];

/** The filters of the stock list (design A5). */
export const STOCK_FILTERS = ['all', 'for_sale', 'consumable', 'low'] as const;
export type StockFilter = (typeof STOCK_FILTERS)[number];

/** How a product's stock looks next to its minimum: shown as a label, not only a colour. */
export const STOCK_STATES = ['ok', 'low', 'out'] as const;
export type StockState = (typeof STOCK_STATES)[number];
