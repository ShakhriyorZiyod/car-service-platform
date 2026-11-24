/** Input limits that the server checks and the clients show as hints. */
export const LIMITS = {
  fullName: { min: 1, max: 100 },
  login: { min: 3, max: 32 },
  password: { min: 8, max: 128 },
  specialization: { max: 100 },
  /** A sign-in code is six digits. */
  codeLength: 6,

  // Reference data (stage 2)
  workshopName: { max: 100 },
  address: { max: 200 },
  url: { max: 500 },
  /** Names of brands, models, zones, service types, boxes and holidays. */
  name: { min: 1, max: 100 },
  note: { max: 300 },
  /** A service type's stable code: lower case, digits and underscores. */
  code: { min: 2, max: 32 },
  /** A price in so‘m. */
  price: { max: 1_000_000_000 },
  /** Working minutes one zone takes: up to two weeks around the clock, far beyond any real job. */
  durationMin: { min: 1, max: 20_160 },

  // Reception and tasks (stage 5)
  mileageKm: { max: 5_000_000 },
  personalItems: { max: 300 },
  defects: { max: 40 },
  /** The admin's instruction for a task. */
  instruction: { max: 1_000 },
  /** The master's report and the admin's remark on it. */
  report: { max: 1_000 },
  /** One photo, after the phone has shrunk it to about 2 Mp. */
  photoBytes: { max: 3 * 1024 * 1024 },
  /** Photos of one attempt of one task. */
  taskPhotos: { max: 20 },

  // Handover and payment (stage 6)
  /** The number of the fiscal receipt the cash register printed (docs/PLAN.md, section 11). */
  receiptNo: { min: 1, max: 64 },
  /** Why a discount was given: "Doimiy mijoz". */
  discountReason: { min: 1, max: 200 },
  /** The client's words about the work. */
  reviewText: { max: 1_000 },

  // The warehouse (stage 8)
  /** The article: "SH-NC1". */
  sku: { min: 1, max: 40 },
  /** EAN-8 to EAN-14, digits only. */
  barcode: { min: 8, max: 14 },
  brand: { max: 60 },
  /** The pack, as written on the card: "1 l", "0,5 l". */
  pack: { max: 40 },
  description: { max: 2_000 },
  productPhotos: { max: 5 },
  /** A quantity in the product's unit; up to three decimals for litres, metres and kilograms. */
  qty: { max: 1_000_000 },
  documentLines: { max: 300 },
  invoiceNo: { max: 64 },
  /** A taxpayer number: 9 digits for a company, 14 for a person (PINFL). */
  inn: { min: 9, max: 14 },
} as const;

/** Telegram's signed contact string; real ones are a few hundred characters. */
export const MAX_CONTACT_LENGTH = 4096;

/** The limits of the workshop's rules, for the server's check and the form's hints. */
export const RULE_LIMITS = {
  slotStepMin: { min: 5, max: 240 },
  minLeadMin: { min: 0, max: 20_160 },
  horizonDays: { min: 1, max: 365 },
  bufferMin: { min: 0, max: 240 },
  holdNewWorkMin: { min: 1, max: 2_880 },
  holdNoAnswerHours: { min: 1, max: 168 },
  callWarnMin: { min: 1, max: 1_440 },
  callEscalateMin: { min: 1, max: 1_440 },
  reminderHours: { min: 1, max: 168, count: 4 },
  adminDiscountLimitPct: { min: 0, max: 100 },
} as const;
