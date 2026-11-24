import type { BodyClass, CancelReasonAudience, ServiceGroup } from '@cs/shared/vocabulary';

/**
 * The reference data every workshop starts with: TZ 14.1 (brands, models, body classes), 14.2 (kinds
 * of work and their zones) and 14.4 (reasons for cancelling). The body classes and the added zones
 * are proposals the client still has to confirm (docs/PLAN.md, section 21, question 3); the owner
 * changes them in the panel. Texts use ‘ (U+2018) for o‘ and g‘, like the rest of the interface.
 */

export interface BrandSeed {
  name: string;
  models: readonly (readonly [name: string, bodyClass: BodyClass])[];
}

export const CAR_BRANDS: readonly BrandSeed[] = [
  {
    name: 'Chevrolet',
    models: [
      ['Onix', 'S'],
      ['Gentra', 'S'],
      ['Nexia 3', 'S'],
      ['Cobalt', 'S'],
      ['Tracker 2', 'M'],
      ['Malibu', 'M'],
    ],
  },
  {
    name: 'BYD',
    models: [
      ['Yuan Up', 'M'],
      ['Chazor', 'M'],
      ['Song Plus', 'L'],
      ['Song Plus Champion', 'L'],
      ['Han', 'L'],
    ],
  },
  {
    name: 'Lada',
    models: [
      ['Granta', 'S'],
      ['Vesta', 'S'],
      ['XRAY', 'S'],
      ['Niva Legend', 'M'],
    ],
  },
  {
    name: 'Chery',
    models: [
      ['Arrizo', 'S'],
      ['Tiggo 3 Pro', 'M'],
      ['Tiggo 7 Pro', 'L'],
      ['Tiggo 8 Pro', 'XL'],
    ],
  },
  {
    name: 'Haval',
    models: [
      ['Jolion', 'M'],
      ['M6', 'L'],
      ['H6', 'L'],
      ['Dargo', 'L'],
    ],
  },
];

export interface ZoneSeed {
  nameUz: string;
  nameRu: string;
  group: ServiceGroup;
  /** "Other": the price is always agreed. */
  isCustom?: boolean;
  /** Choosing this zone drops these, named by `nameUz` within the same kind of work. */
  excludes?: readonly string[];
}

export interface ServiceTypeSeed {
  code: string;
  nameUz: string;
  nameRu: string;
  /** A Lucide icon name. */
  icon: string;
  zones: readonly ZoneSeed[];
}

const OTHER: ZoneSeed = { nameUz: 'Boshqa', nameRu: 'Другое', group: 'other', isCustom: true };

export const SERVICE_TYPES: readonly ServiceTypeSeed[] = [
  {
    code: 'polish',
    nameUz: 'Sayqallash',
    nameRu: 'Полировка',
    icon: 'sparkles',
    zones: [
      { nameUz: 'Old oyna', nameRu: 'Лобовое стекло', group: 'glass' },
      { nameUz: 'Orqa oyna', nameRu: 'Заднее стекло', group: 'glass' },
      {
        nameUz: 'Old yon oynalar (2 ta)',
        nameRu: 'Передние боковые стёкла (2 шт.)',
        group: 'glass',
      },
      {
        nameUz: 'Orqa yon oynalar (2 ta)',
        nameRu: 'Задние боковые стёкла (2 шт.)',
        group: 'glass',
      },
      { nameUz: 'Kapot', nameRu: 'Капот', group: 'body' },
      { nameUz: 'Bagaj qopqog‘i', nameRu: 'Крышка багажника', group: 'body' },
      { nameUz: 'Old bamper', nameRu: 'Передний бампер', group: 'body' },
      { nameUz: 'Orqa bamper', nameRu: 'Задний бампер', group: 'body' },
      { nameUz: 'Old faralar', nameRu: 'Фары (передние)', group: 'body' },
      {
        nameUz: 'To‘liq kuzov',
        nameRu: 'Полный кузов',
        group: 'body',
        excludes: ['Kapot', 'Bagaj qopqog‘i', 'Old bamper', 'Orqa bamper', 'Old faralar'],
      },
      OTHER,
    ],
  },
  {
    code: 'ceramic',
    nameUz: 'Keramika',
    nameRu: 'Керамика',
    icon: 'gem',
    zones: [
      { nameUz: 'Kapot', nameRu: 'Капот', group: 'body' },
      { nameUz: 'Bagaj qopqog‘i', nameRu: 'Крышка багажника', group: 'body' },
      { nameUz: 'Old bamper', nameRu: 'Передний бампер', group: 'body' },
      { nameUz: 'Orqa bamper', nameRu: 'Задний бампер', group: 'body' },
      { nameUz: 'G‘ildirak disklari', nameRu: 'Колёсные диски', group: 'body' },
      {
        nameUz: 'To‘liq kuzov',
        nameRu: 'Полный кузов',
        group: 'body',
        excludes: ['Kapot', 'Bagaj qopqog‘i', 'Old bamper', 'Orqa bamper'],
      },
      {
        nameUz: 'Salon: plastik va eshik qoplamalari',
        nameRu: 'Салон: пластик и дверные обшивки',
        group: 'interior',
      },
    ],
  },
  {
    code: 'ppf',
    nameUz: 'Bronplyonka',
    nameRu: 'Бронеплёнка',
    icon: 'shield',
    zones: [
      { nameUz: 'Old oyna', nameRu: 'Лобовое стекло', group: 'glass' },
      {
        nameUz: 'Old yon oynalar (2 ta)',
        nameRu: 'Передние боковые стёкла (2 шт.)',
        group: 'glass',
      },
      { nameUz: 'Kapot', nameRu: 'Капот', group: 'body' },
      { nameUz: 'Old bamper', nameRu: 'Передний бампер', group: 'body' },
      { nameUz: 'Old faralar', nameRu: 'Фары передние', group: 'body' },
      { nameUz: 'Orqa faralar', nameRu: 'Фары задние', group: 'body' },
      { nameUz: 'Ostonalar', nameRu: 'Пороги', group: 'body' },
      {
        nameUz: 'Xavfli zonalar paketi',
        nameRu: 'Зоны риска (пакет: капот, бампер, фары, зеркала)',
        group: 'body',
      },
      {
        nameUz: 'To‘liq kuzov',
        nameRu: 'Полный кузов',
        group: 'body',
        excludes: [
          'Kapot',
          'Old bamper',
          'Old faralar',
          'Orqa faralar',
          'Ostonalar',
          'Xavfli zonalar paketi',
        ],
      },
    ],
  },
  {
    code: 'lamination',
    nameUz: 'Laminatsiya',
    nameRu: 'Ламинация',
    icon: 'layers',
    zones: [
      { nameUz: 'Interyer elementlari', nameRu: 'Элементы интерьера', group: 'interior' },
      { nameUz: 'Kuzov xavfli zonalari', nameRu: 'Зоны риска кузова', group: 'body' },
      OTHER,
    ],
  },
  {
    code: 'dry_clean',
    nameUz: 'Kimyoviy tozalash',
    nameRu: 'Химчистка',
    icon: 'spray-can',
    zones: [
      { nameUz: 'Old panel (torpedo)', nameRu: 'Передняя панель (торпедо)', group: 'interior' },
      { nameUz: 'Eshik qoplamalari', nameRu: 'Дверные обшивки', group: 'interior' },
      { nameUz: 'O‘rindiqlar', nameRu: 'Сиденья', group: 'interior' },
      { nameUz: 'Shift', nameRu: 'Потолок', group: 'interior' },
      { nameUz: 'Bagaj bo‘limi', nameRu: 'Багажный отсек', group: 'interior' },
      {
        nameUz: 'To‘liq salon',
        nameRu: 'Полный салон',
        group: 'interior',
        excludes: [
          'Old panel (torpedo)',
          'Eshik qoplamalari',
          'O‘rindiqlar',
          'Shift',
          'Bagaj bo‘limi',
        ],
      },
    ],
  },
  {
    code: 'wash',
    nameUz: 'Yuvish',
    nameRu: 'Мойка',
    icon: 'droplets',
    zones: [
      { nameUz: 'Kuzov (to‘liq)', nameRu: 'Кузов (полная)', group: 'body' },
      { nameUz: 'G‘ildirak disklari', nameRu: 'Колёсные диски', group: 'body' },
      { nameUz: 'Motor bo‘limi', nameRu: 'Моторный отсек', group: 'other' },
      { nameUz: 'Gilamchalar', nameRu: 'Коврики', group: 'interior' },
    ],
  },
];

export interface CancelReasonSeed {
  code: string;
  nameUz: string;
  nameRu: string;
  appliesTo: CancelReasonAudience;
  requiresText?: boolean;
}

/** TZ 14.4. `client` ones the client and the staff may choose, `staff` ones only the staff. */
export const CANCEL_REASONS: readonly CancelReasonSeed[] = [
  { code: 'changed_mind', nameUz: 'Fikr o‘zgardi', nameRu: 'Передумал', appliesTo: 'client' },
  { code: 'too_expensive', nameUz: 'Qimmat', nameRu: 'Дорого', appliesTo: 'client' },
  {
    code: 'other_service',
    nameUz: 'Boshqa servis tanlandi',
    nameRu: 'Выбран другой сервис',
    appliesTo: 'client',
  },
  {
    code: 'inconvenient_time',
    nameUz: 'Vaqt noqulay',
    nameRu: 'Неудобное время',
    appliesTo: 'client',
  },
  {
    code: 'other',
    nameUz: 'Boshqa sabab',
    nameRu: 'Другое',
    appliesTo: 'client',
    requiresText: true,
  },
  {
    code: 'cannot_perform',
    nameUz: 'Servis bajara olmaydi',
    nameRu: 'Сервис не может выполнить',
    appliesTo: 'staff',
  },
  { code: 'duplicate', nameUz: 'Ariza takrorlangan', nameRu: 'Дубль заявки', appliesTo: 'staff' },
  { code: 'no_show', nameUz: 'Kelmadi', nameRu: 'Неявка', appliesTo: 'staff' },
  {
    code: 'no_contact',
    nameUz: 'Aloqa bo‘lmadi',
    nameRu: 'Нет связи с клиентом',
    appliesTo: 'system',
  },
  // Stage 9: a gathered shop order nobody came for. Existing workshops get it from migration 0015.
  {
    code: 'not_picked_up',
    nameUz: 'Muddatida olib ketilmadi',
    nameRu: 'Не забрали в срок',
    appliesTo: 'system',
  },
];

export interface ProductCategorySeed {
  nameUz: string;
  nameRu: string;
  children?: readonly { nameUz: string; nameRu: string }[];
}

/**
 * TZ 14.3: the shop's categories. "Aksessuarlar" is one group with three subcategories, which the
 * Mini App shows as three tiles. Consumables are not sold, but they live in the warehouse too.
 */
export const PRODUCT_CATEGORIES: readonly ProductCategorySeed[] = [
  { nameUz: 'Shampunlar', nameRu: 'Шампуни' },
  { nameUz: 'Yuvish kimyosi', nameRu: 'Химия для мойки' },
  { nameUz: 'Polirol va himoya', nameRu: 'Полироли и защита' },
  { nameUz: 'Qoraytirgichlar', nameRu: 'Чернители' },
  { nameUz: 'Xushbo‘ylagichlar', nameRu: 'Освежители' },
  {
    nameUz: 'Aksessuarlar',
    nameRu: 'Аксессуары',
    children: [
      { nameUz: 'Sochiqlar', nameRu: 'Полотенца' },
      { nameUz: 'Cho‘tkalar', nameRu: 'Щётки' },
      { nameUz: 'Gubkalar va qo‘lqoplar', nameRu: 'Губки и варежки' },
    ],
  },
  { nameUz: 'Sarf materiallari', nameRu: 'Расходные материалы' },
];
