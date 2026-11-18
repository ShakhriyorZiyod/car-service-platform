import { formatPlate, normalizePlate, PLATE_REGIONS } from '@cs/shared/format';
import { describe, expect, it } from 'vitest';

describe('normalizePlate: Uzbek plates, stored compact and upper-case', () => {
  it.each([
    // Personal: region, letter, three digits, two letters (the design's plates).
    ['01 A 777 BA', '01A777BA'],
    ['01a777ba', '01A777BA'],
    ['01-A-777-BA', '01A777BA'],
    ['  30 S 640 BB ', '30S640BB'],
    ['10 R 118 AB', '10R118AB'],
    // Legal entity: region, three digits, three letters.
    ['01 123 ABC', '01123ABC'],
    ['95 001 xyz', '95001XYZ'],
  ])('%j → %s', (input, expected) => {
    expect(normalizePlate(input)).toBe(expected);
  });

  it('reads Cyrillic look-alike letters typed on a Russian keyboard as Latin', () => {
    expect(normalizePlate('01 А 777 ВА')).toBe('01A777BA');
    expect(normalizePlate('01 а 777 ва')).toBe('01A777BA');
    expect(normalizePlate('01 123 СМК')).toBe('01123CMK');
    expect(normalizePlate('40 Х 123 ОР')).toBe('40X123OP');
  });

  it.each([
    ['an empty string', ''],
    ['a region that does not exist', '02 A 777 BA'],
    ['a region of one digit', '1 A 777 BA'],
    ['two letters before the digits', '01 AB 777 BA'],
    ['two digits in the middle', '01 A 77 BA'],
    ['one letter at the end', '01 A 777 B'],
    ['a legal plate with two letters', '01 123 AB'],
    ['a Cyrillic letter with no Latin look-alike', '01 Д 777 BA'],
    ['other symbols', '01 A 777 B@'],
  ])('rejects %s', (_case, input) => {
    expect(normalizePlate(input)).toBeNull();
  });

  it('accepts every region code', () => {
    for (const region of PLATE_REGIONS) {
      expect(normalizePlate(`${region} A 123 BC`)).toBe(`${region}A123BC`);
    }
  });
});

describe('formatPlate: region and the rest, as the chip shows them', () => {
  it('splits a personal plate', () => {
    expect(formatPlate('01A777BA')).toEqual({ region: '01', number: 'A 777 BA' });
  });

  it('splits a legal plate', () => {
    expect(formatPlate('01123ABC')).toEqual({ region: '01', number: '123 ABC' });
  });

  it('formats what normalizePlate stored', () => {
    const stored = normalizePlate('30 s 640 bb');
    expect(stored && formatPlate(stored)).toEqual({ region: '30', number: 'S 640 BB' });
  });
});
