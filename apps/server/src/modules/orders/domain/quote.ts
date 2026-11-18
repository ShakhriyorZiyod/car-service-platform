/**
 * The price and time of what a client picked (docs/PLAN.md, sections 10.2 and 11). Pure: the
 * zones' offers at the car's class arrive as an argument.
 */

/** A zone as the price list offers it at one body class (the catalog module provides it). */
export interface ZoneOffer {
  serviceId: string;
  serviceTypeId: string;
  nameUz: string;
  nameRu: string;
  typeNameUz: string;
  typeNameRu: string;
  /** The zone and its kind of work are both in use. */
  isActive: boolean;
  /** Choosing this zone drops these. */
  excludes: readonly string[];
  /** Null when the zone is not offered for this class. */
  cell: { price: number | null; durationMin: number } | null;
}

export interface QuoteLine {
  serviceId: string;
  serviceTypeId: string;
  nameUz: string;
  nameRu: string;
  typeNameUz: string;
  typeNameRu: string;
  /** Null: the price is agreed with the client. */
  price: number | null;
  durationMin: number;
}

export interface Quote {
  lines: QuoteLine[];
  /** The total of the zones that have a price; "to be agreed" zones are not in it. */
  subtotal: number;
  unpricedCount: number;
  workMinutes: number;
  bufferMin: number;
  /** `W`: how long a box is held. */
  totalMinutes: number;
  /** More than the longest working day: the client picks the day the car is handed over. */
  multiDay: boolean;
}

export type QuoteProblem =
  | 'nothing_chosen'
  | 'unknown_zone'
  | 'zone_not_in_use'
  | 'not_offered_for_class'
  | 'zones_exclude_each_other';

export type QuoteResult =
  { ok: true; quote: Quote } | { ok: false; problem: QuoteProblem; serviceId?: string };

export function buildQuote(
  chosen: readonly string[],
  offers: readonly ZoneOffer[],
  options: { bufferMin: number; longestWorkdayMin: number },
): QuoteResult {
  const ids = [...new Set(chosen)];
  if (ids.length === 0) return { ok: false, problem: 'nothing_chosen' };

  const lines: QuoteLine[] = [];
  for (const id of ids) {
    const offer = offers.find((candidate) => candidate.serviceId === id);
    if (!offer) return { ok: false, problem: 'unknown_zone', serviceId: id };
    if (!offer.isActive) return { ok: false, problem: 'zone_not_in_use', serviceId: id };
    if (!offer.cell) return { ok: false, problem: 'not_offered_for_class', serviceId: id };
    lines.push({
      serviceId: offer.serviceId,
      serviceTypeId: offer.serviceTypeId,
      nameUz: offer.nameUz,
      nameRu: offer.nameRu,
      typeNameUz: offer.typeNameUz,
      typeNameRu: offer.typeNameRu,
      price: offer.cell.price,
      durationMin: offer.cell.durationMin,
    });
  }

  // "Whole body" covers the panels: choosing both would be paying twice for the same work.
  for (const id of ids) {
    const offer = offers.find((candidate) => candidate.serviceId === id);
    const clash = offer?.excludes.find((excluded) => ids.includes(excluded));
    if (clash) return { ok: false, problem: 'zones_exclude_each_other', serviceId: clash };
  }

  const workMinutes = lines.reduce((sum, line) => sum + line.durationMin, 0);
  const totalMinutes = workMinutes + options.bufferMin;
  return {
    ok: true,
    quote: {
      lines,
      subtotal: lines.reduce((sum, line) => sum + (line.price ?? 0), 0),
      unpricedCount: lines.filter((line) => line.price === null).length,
      workMinutes,
      bufferMin: options.bufferMin,
      totalMinutes,
      multiDay: totalMinutes > options.longestWorkdayMin,
    },
  };
}

/** The kinds of work an order needs, once each: which boxes can take it. */
export function serviceTypesOf(quote: Quote): string[] {
  return [...new Set(quote.lines.map((line) => line.serviceTypeId))];
}
