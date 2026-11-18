import type { BodyClass, Role } from '@cs/shared/vocabulary';

/**
 * Demo data for development only (`npm run seed:demo`): a workshop to click through while the
 * client's real prices, boxes and hours are still open questions (docs/PLAN.md, section 21,
 * questions 1 and 2). The bronplyonka matrix is the design's (admin PDF, page 13); the rest is
 * plausible, not the client's.
 */

export type PriceAndMinutes = readonly [price: number | null, minutes: number];

/** The design's bronplyonka matrix by zone: S, M, L, XL. */
export const DESIGN_PPF: Readonly<Record<string, Readonly<Record<BodyClass, PriceAndMinutes>>>> = {
  'Old oyna': {
    S: [750_000, 81],
    M: [900_000, 90],
    L: [1_100_000, 99],
    XL: [1_250_000, 108],
  },
  'Old yon oynalar (2 ta)': {
    S: [500_000, 54],
    M: [600_000, 60],
    L: [700_000, 66],
    XL: [850_000, 72],
  },
  Kapot: {
    S: [1_200_000, 108],
    M: [1_400_000, 120],
    L: [1_800_000, 132],
    XL: [1_950_000, 144],
  },
  'Old bamper': {
    S: [1_350_000, 135],
    M: [1_600_000, 150],
    L: [2_000_000, 165],
    XL: [2_250_000, 180],
  },
  'Old faralar': {
    S: [450_000, 36],
    M: [500_000, 40],
    L: [600_000, 44],
    XL: [700_000, 48],
  },
  'Orqa faralar': {
    S: [350_000, 27],
    M: [400_000, 30],
    L: [500_000, 33],
    XL: [550_000, 36],
  },
  Ostonalar: {
    S: [600_000, 54],
    M: [700_000, 60],
    L: [850_000, 66],
    XL: [1_000_000, 72],
  },
  // The design shows "3 ish kuni" and "4 ish kuni": three and four ten-hour working days.
  'To‘liq kuzov': {
    S: [12_350_000, 1_296],
    M: [14_500_000, 1_800],
    L: [17_400_000, 2_400],
    XL: [20_300_000, 2_400],
  },
  // Not on the page that was seen: an estimate.
  'Xavfli zonalar paketi': {
    S: [2_900_000, 297],
    M: [3_200_000, 330],
    L: [3_800_000, 363],
    XL: [4_300_000, 396],
  },
};

/** For the other kinds of work: the M class's price and minutes; the other classes scale from it. */
export const DEMO_BASE: Readonly<Record<string, Readonly<Record<string, PriceAndMinutes>>>> = {
  polish: {
    'Old oyna': [350_000, 60],
    'Orqa oyna': [300_000, 50],
    'Old yon oynalar (2 ta)': [250_000, 45],
    'Orqa yon oynalar (2 ta)': [250_000, 45],
    Kapot: [600_000, 90],
    'Bagaj qopqog‘i': [450_000, 70],
    'Old bamper': [500_000, 75],
    'Orqa bamper': [450_000, 70],
    'Old faralar': [300_000, 40],
    'To‘liq kuzov': [3_500_000, 720],
    Boshqa: [null, 60],
  },
  ceramic: {
    Kapot: [2_400_000, 150],
    'Bagaj qopqog‘i': [1_600_000, 120],
    'Old bamper': [2_100_000, 140],
    'Orqa bamper': [1_900_000, 130],
    'G‘ildirak disklari': [1_200_000, 90],
    'To‘liq kuzov': [12_800_000, 1_500],
    'Salon: plastik va eshik qoplamalari': [1_800_000, 180],
  },
  lamination: {
    'Interyer elementlari': [900_000, 120],
    'Kuzov xavfli zonalari': [1_100_000, 150],
    Boshqa: [null, 60],
  },
  dry_clean: {
    'Old panel (torpedo)': [200_000, 40],
    'Eshik qoplamalari': [300_000, 60],
    'O‘rindiqlar': [450_000, 90],
    Shift: [250_000, 45],
    'Bagaj bo‘limi': [200_000, 40],
    'To‘liq salon': [1_100_000, 240],
  },
  wash: {
    'Kuzov (to‘liq)': [100_000, 40],
    'G‘ildirak disklari': [80_000, 30],
    'Motor bo‘limi': [150_000, 45],
    Gilamchalar: [60_000, 25],
  },
};

export const CLASS_PRICE_FACTOR: Readonly<Record<BodyClass, number>> = {
  S: 0.9,
  M: 1,
  L: 1.2,
  XL: 1.35,
};
export const CLASS_TIME_FACTOR: Readonly<Record<BodyClass, number>> = {
  S: 0.9,
  M: 1,
  L: 1.1,
  XL: 1.2,
};

/** Mondays to Saturdays, 09:00–20:00 (the design's day); Sunday is off. */
export const DEMO_WEEK = [1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  open: '09:00',
  close: '20:00',
  breakStart: null,
  breakEnd: null,
}));

/** Fixed national holidays of the coming year. */
export const DEMO_HOLIDAYS = [
  { date: '2026-12-08', name: 'Konstitutsiya kuni' },
  { date: '2027-01-01', name: 'Yangi yil' },
  { date: '2027-03-08', name: 'Xalqaro xotin-qizlar kuni' },
  { date: '2027-03-21', name: 'Navro‘z' },
];

/** The design's four boxes; each does the kinds of work named by code. */
export const DEMO_BOXES = [
  { name: '1-boks', serviceTypes: ['polish', 'dry_clean', 'lamination', 'wash'] },
  { name: '2-boks', serviceTypes: ['polish', 'dry_clean', 'wash'] },
  { name: '3-boks', note: 'Plyonka va keramika', serviceTypes: ['ceramic', 'ppf'] },
  {
    name: '4-boks',
    note: 'Ko‘targichli',
    serviceTypes: ['polish', 'ceramic', 'ppf', 'lamination', 'dry_clean', 'wash'],
  },
];

export const DEMO_PASSWORD = 'demo-password-1';

export interface DemoStaff {
  fullName: string;
  phone: string;
  roles: Role[];
  specialization?: string;
  login?: string;
}

export const DEMO_STAFF: readonly DemoStaff[] = [
  { fullName: 'Dilfuza Sobirova', phone: '+998900000010', roles: ['admin'], login: 'demo-admin' },
  { fullName: 'Aziz Rahimov', phone: '+998900000011', roles: ['director'], login: 'demo-director' },
  {
    fullName: 'Odilbek',
    phone: '+998900000001',
    roles: ['master'],
    specialization: 'Kimyoviy tozalash, yuvish',
  },
  {
    fullName: 'Javohir',
    phone: '+998900000002',
    roles: ['master'],
    specialization: 'Plyonka, keramika',
  },
  {
    fullName: 'Ruslan',
    phone: '+998900000003',
    roles: ['master'],
    specialization: 'Plyonka, keramika',
  },
  {
    fullName: 'Bekzod Aliyev',
    phone: '+998900000004',
    roles: ['master'],
    specialization: 'Sayqallash',
  },
];
