/**
 * Words of the work itself: the reception act, the masters' tasks and the photos
 * (docs/PLAN.md, sections 7.9–7.11 and 9.2–9.4). The database enums repeat these values.
 */

export const TASK_STATUSES = [
  'assigned',
  'in_progress',
  'on_review',
  'rework',
  'accepted',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** The master's lists (design U1): what is being done, what came back, what is handed in. */
export const MASTER_TASK_TABS = ['today', 'rework', 'done'] as const;
export type MasterTaskTab = (typeof MASTER_TASK_TABS)[number];

/** The admin's lists (design A3): to check, in progress, finished. */
export const ADMIN_TASK_TABS = ['review', 'active', 'done'] as const;
export type AdminTaskTab = (typeof ADMIN_TASK_TABS)[number];

/** The photos of a task: before the work and after it. */
export const TASK_PHOTO_KINDS = ['before', 'after'] as const;
export type TaskPhotoKind = (typeof TASK_PHOTO_KINDS)[number];

export const ACT_STATUSES = ['draft', 'sent', 'confirmed'] as const;
export type ActStatus = (typeof ACT_STATUSES)[number];

/** `verbal`: the admin wrote down that the client agreed in person or by phone. */
export const ACT_CONFIRM_CHANNELS = ['bot', 'tma', 'verbal'] as const;
export type ActConfirmChannel = (typeof ACT_CONFIRM_CHANNELS)[number];

/** The views of the car on which a defect is marked (design A2, BodySchema). */
export const DEFECT_VIEWS = ['top', 'left', 'right', 'front', 'back', 'interior'] as const;
export type DefectView = (typeof DEFECT_VIEWS)[number];

export const DEFECT_KINDS = ['scratch', 'chip', 'dent', 'crack', 'other'] as const;
export type DefectKind = (typeof DEFECT_KINDS)[number];

/** The four sides that must be photographed before the act can be sent. */
export const PHOTO_SIDES = ['front', 'back', 'left', 'right'] as const;
export type PhotoSide = (typeof PHOTO_SIDES)[number];

export const MEDIA_PURPOSES = [
  'reception_side',
  'reception_defect',
  'task_before',
  'task_after',
  // Stage 8: up to five photos of a product, and the supplier's invoice of a receipt
  'product_photo',
  'stock_invoice',
] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

/** What the client is asked to confirm besides the mileage and the fuel (TZ, reception act). */
export const CHECKLIST_ITEMS = ['spareWheel', 'jack', 'mats', 'documents'] as const;
export type ChecklistItem = (typeof CHECKLIST_ITEMS)[number];

/** The fuel gauge in quarters: empty, 1/4, 1/2, 3/4, full. */
export const FUEL_LEVELS = [0, 1, 2, 3, 4] as const;

/** Photos are JPEG, PNG or WebP, found out from the bytes; nothing else is kept. */
export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PhotoMime = (typeof PHOTO_MIME_TYPES)[number];
