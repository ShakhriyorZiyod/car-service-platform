import { describe, expect, it } from 'vitest';
import { readImage } from '../../../src/modules/media/domain/image';
import {
  isValidMediaLink,
  MEDIA_LINK_SECONDS,
  signMediaLink,
} from '../../../src/modules/media/domain/signed-url';
import {
  gif,
  html,
  jpeg,
  png,
  svg,
  webpExtended,
  webpLossless,
  webpLossy,
} from '../../helpers/images';

describe('what a photo is, from its bytes (PLAN 4.9)', () => {
  it.each([
    ['a JPEG', jpeg(1600, 1200), { mime: 'image/jpeg', width: 1600, height: 1200 }],
    ['a PNG', png(800, 600), { mime: 'image/png', width: 800, height: 600 }],
    ['a lossy WebP', webpLossy(1280, 960), { mime: 'image/webp', width: 1280, height: 960 }],
    ['a lossless WebP', webpLossless(1024, 768), { mime: 'image/webp', width: 1024, height: 768 }],
    [
      'an extended WebP',
      webpExtended(3000, 2000),
      { mime: 'image/webp', width: 3000, height: 2000 },
    ],
  ])('%s is read', (_name, bytes, expected) => {
    expect(readImage(bytes)).toEqual(expected);
  });

  it.each([
    ['an SVG', svg],
    ['an HTML page', html],
    ['a GIF', gif],
    ['nothing', Buffer.alloc(0)],
    ['plain text', Buffer.from('not a picture at all')],
    ['a JPEG cut off before its frame header', jpeg(100, 100).subarray(0, 12)],
    ['a PNG cut off in its header', png(100, 100).subarray(0, 20)],
    ['a WebP cut off', webpLossy(100, 100).subarray(0, 24)],
  ])('%s is refused', (_name, bytes) => {
    expect(readImage(bytes)).toBeNull();
  });

  it('the type is what the bytes say: an SVG, an HTML page or text with a picture’s name stays refused', () => {
    // The name and the declared type never reach the reader: only the bytes are looked at.
    expect(readImage(svg)).toBeNull();
    expect(
      readImage(Buffer.concat([Buffer.from('<?xml version="1.0"?>'), jpeg(10, 10)])),
    ).toBeNull();
  });

  it('a picture of no size, or an absurd one, is refused', () => {
    expect(readImage(png(0, 100))).toBeNull();
    expect(readImage(png(100, 0))).toBeNull();
    expect(readImage(png(20_001, 100))).toBeNull();
    expect(readImage(jpeg(100, 25_000))).toBeNull();
  });

  it('a JPEG whose scan starts before any frame header has no size, and is refused', () => {
    const scanFirst = Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);
    expect(readImage(scanFirst)).toBeNull();
  });

  it('a JPEG with fill bytes and tables before the frame is still read', () => {
    const tables = Buffer.from([0xff, 0xdb, 0x00, 0x04, 0x00, 0x10]); // a quantisation table
    const base = jpeg(640, 480);
    const withTables = Buffer.concat([
      base.subarray(0, 2),
      Buffer.from([0xff, 0xff]),
      tables,
      base.subarray(2),
    ]);
    expect(readImage(withTables)).toEqual({ mime: 'image/jpeg', width: 640, height: 480 });
  });
});

describe('the signed link to a photo (PLAN 4.9, 15)', () => {
  const secret = 'a-secret-that-is-at-least-thirty-two-chars';
  const id = '01a1ed8b-d12a-7182-b095-fb2a6c1844d7';
  const now = new Date('2026-11-20T10:00:00Z');

  it('works for the photo it was made for, until it runs out', () => {
    const link = signMediaLink(secret, id, now);
    expect(link.expires).toBe(Math.floor(now.getTime() / 1000) + MEDIA_LINK_SECONDS);
    expect(isValidMediaLink(secret, id, link, now)).toBe(true);
    const lastSecond = new Date((link.expires - 1) * 1000);
    expect(isValidMediaLink(secret, id, link, lastSecond)).toBe(true);
    expect(isValidMediaLink(secret, id, link, new Date(link.expires * 1000))).toBe(false);
  });

  it.each([
    [
      'another photo',
      (link: { expires: number; signature: string }) => ({
        link,
        id: '01a1ed8b-d12a-7182-b095-fb2a6c1844d8',
      }),
    ],
    [
      'a later end time',
      (link: { expires: number; signature: string }) => ({
        link: { ...link, expires: link.expires + 3600 },
        id,
      }),
    ],
    [
      'a cut signature',
      (link: { expires: number; signature: string }) => ({
        link: { ...link, signature: link.signature.slice(0, -2) },
        id,
      }),
    ],
    [
      'an empty signature',
      (link: { expires: number; signature: string }) => ({ link: { ...link, signature: '' }, id }),
    ],
    [
      'a changed signature',
      (link: { expires: number; signature: string }) => ({
        link: {
          ...link,
          signature: `${link.signature.slice(0, -1)}${link.signature.endsWith('A') ? 'B' : 'A'}`,
        },
        id,
      }),
    ],
    [
      'a fractional end time',
      (link: { expires: number; signature: string }) => ({
        link: { ...link, expires: link.expires + 0.5 },
        id,
      }),
    ],
  ])('is refused with %s', (_name, change) => {
    const { link, id: forId } = change(signMediaLink(secret, id, now));
    expect(isValidMediaLink(secret, forId, link, now)).toBe(false);
  });

  it('is refused when signed with another secret', () => {
    const link = signMediaLink('some-other-secret-that-is-long-enough!!', id, now);
    expect(isValidMediaLink(secret, id, link, now)).toBe(false);
  });
});
