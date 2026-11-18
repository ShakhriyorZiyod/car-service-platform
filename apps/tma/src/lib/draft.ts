import { readStored, writeStored } from '../telegram';

/** The booking a client left unfinished: which car and zones they had picked (docs/PLAN.md, 1.3). */
export interface BookingDraft {
  carId: string | null;
  typeId: string | null;
  serviceIds: string[];
}

const KEY = 'booking-draft';

export async function loadBookingDraft(): Promise<BookingDraft | null> {
  const raw = await readStored(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<BookingDraft>;
    if (!Array.isArray(parsed.serviceIds)) return null;
    return {
      carId: typeof parsed.carId === 'string' ? parsed.carId : null,
      typeId: typeof parsed.typeId === 'string' ? parsed.typeId : null,
      serviceIds: parsed.serviceIds.filter((id): id is string => typeof id === 'string'),
    };
  } catch {
    return null;
  }
}

export const saveBookingDraft = (draft: BookingDraft): Promise<void> =>
  writeStored(KEY, draft.serviceIds.length > 0 ? JSON.stringify(draft) : null);

export const clearBookingDraft = (): Promise<void> => writeStored(KEY, null);
