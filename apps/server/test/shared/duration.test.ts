import { formatDuration } from '@cs/shared/format';
import { describe, expect, it } from 'vitest';

describe('formatDuration: working time in the price list (design A12)', () => {
  it.each([
    [81, 'uz', '1 s 21 d'],
    [54, 'uz', '54 d'],
    [60, 'uz', '1 s'],
    [120, 'uz', '2 s'],
    [1_296, 'uz', '21 s 36 d'],
    [0, 'uz', '0 d'],
    [81, 'ru', '1 ч 21 мин'],
    [45, 'ru', '45 мин'],
    [180, 'ru', '3 ч'],
  ] as const)('%i minutes in %s is "%s"', (minutes, lang, expected) => {
    // The spaces are non-breaking, so a number never parts from its unit.
    expect(formatDuration(minutes, lang)).toBe(expected.replaceAll(' ', ' '));
  });

  it('rounds to whole minutes and never goes below zero', () => {
    expect(formatDuration(59.6, 'uz')).toBe('1 s');
    expect(formatDuration(-5, 'uz')).toBe('0 d');
  });
});
