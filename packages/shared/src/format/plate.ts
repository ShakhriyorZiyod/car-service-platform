/**
 * Uzbek licence plates (TZ 4.2, 15.6). Two formats:
 *   personal  01 A 123 BC   region, letter, three digits, two letters
 *   legal     01 123 ABC    region, three digits, three letters
 * Stored compact and upper-case ("01A123BC"), shown split into the region and the rest, as on the
 * plate itself (docs/DESIGN.md, section 2.4).
 */

/** The first two digits: the region that issued the plate. */
export const PLATE_REGIONS = [
  '01', // Toshkent shahri
  '10', // Toshkent viloyati
  '20', // Sirdaryo
  '25', // Jizzax
  '30', // Samarqand
  '40', // Farg‘ona
  '50', // Namangan
  '60', // Andijon
  '70', // Qashqadaryo
  '75', // Surxondaryo
  '80', // Buxoro
  '85', // Navoiy
  '90', // Xorazm
  '95', // Qoraqalpog‘iston
] as const;

const REGIONS: ReadonlySet<string> = new Set(PLATE_REGIONS);

const PERSONAL = /^(\d{2})([A-Z])(\d{3})([A-Z]{2})$/;
const LEGAL = /^(\d{2})(\d{3})([A-Z]{3})$/;

/**
 * Plates use Latin letters, but a phone set to Russian types their Cyrillic look-alikes. Without
 * this, "01 А 777 ВА" typed in Cyrillic would be rejected or, worse, stored as a different plate.
 */
const CYRILLIC_LOOKALIKES: Readonly<Record<string, string>> = {
  А: 'A',
  В: 'B',
  Е: 'E',
  К: 'K',
  М: 'M',
  Н: 'H',
  О: 'O',
  Р: 'P',
  С: 'C',
  Т: 'T',
  У: 'Y',
  Х: 'X',
};

/**
 * A plate or a part of one, in the stored form: upper-case Latin letters, no spaces or dashes.
 * "01-а 777" → "01A777". Searching compares this with the stored plates.
 */
export function compactPlate(input: string): string {
  return [...input.trim().toUpperCase()]
    .map((char) => CYRILLIC_LOOKALIKES[char] ?? char)
    .join('')
    .replace(/[\s-]/g, '');
}

/** "01 a 777 ba", "01-А-777-ВА" → "01A777BA"; null when it is not a valid Uzbek plate. */
export function normalizePlate(input: string): string | null {
  const compact = compactPlate(input);
  const match = PERSONAL.exec(compact) ?? LEGAL.exec(compact);
  if (!match?.[1] || !REGIONS.has(match[1])) return null;
  return compact;
}

/** "01A777BA" → { region: "01", number: "A 777 BA" }; "01123ABC" → { region: "01", number: "123 ABC" }. */
export function formatPlate(plate: string): { region: string; number: string } {
  const personal = PERSONAL.exec(plate);
  if (personal) {
    const [, region = '', letter, digits, letters] = personal;
    return { region, number: `${letter} ${digits} ${letters}` };
  }
  const legal = LEGAL.exec(plate);
  if (legal) {
    const [, region = '', digits, letters] = legal;
    return { region, number: `${digits} ${letters}` };
  }
  return { region: '', number: plate };
}
