/**
 * Smallest possible pictures of each kind, with the headers a real file has. The media module only
 * reads the headers (type and size), so the pixels are not there.
 */

const u32 = (value: number): number[] => [
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
];
const le16 = (value: number): number[] => [value & 0xff, (value >>> 8) & 0xff];
const text = (value: string): number[] => [...value].map((char) => char.charCodeAt(0));

export function jpeg(width: number, height: number): Buffer {
  return Buffer.from([
    0xff,
    0xd8, // start of image
    0xff,
    0xe0,
    0x00,
    0x10,
    ...text('JFIF'),
    0x00,
    0x01,
    0x01,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00, // APP0
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >>> 8) & 0xff,
    height & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    0x03,
    0x01,
    0x22,
    0x00,
    0x02,
    0x11,
    0x01,
    0x03,
    0x11,
    0x01, // SOF0
    0xff,
    0xd9, // end of image
  ]);
}

export function png(width: number, height: number): Buffer {
  return Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...u32(13),
    ...text('IHDR'),
    ...u32(width),
    ...u32(height),
    8,
    2,
    0,
    0,
    0,
    ...u32(0),
    ...u32(0),
    ...text('IEND'),
    ...u32(0),
  ]);
}

/** Lossy WebP (`VP8 `). */
export function webpLossy(width: number, height: number): Buffer {
  const payload = [0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a, ...le16(width), ...le16(height), 0, 0, 0, 0];
  return Buffer.from([
    ...text('RIFF'),
    ...u32(0).reverse(),
    ...text('WEBP'),
    ...text('VP8 '),
    payload.length,
    0,
    0,
    0,
    ...payload,
  ]);
}

/** Lossless WebP (`VP8L`). */
export function webpLossless(width: number, height: number): Buffer {
  const bits = ((width - 1) | ((height - 1) << 14)) >>> 0;
  const payload = [
    0x2f,
    bits & 0xff,
    (bits >>> 8) & 0xff,
    (bits >>> 16) & 0xff,
    (bits >>> 24) & 0xff,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ];
  return Buffer.from([
    ...text('RIFF'),
    0,
    0,
    0,
    0,
    ...text('WEBP'),
    ...text('VP8L'),
    payload.length,
    0,
    0,
    0,
    ...payload,
  ]);
}

/** Extended WebP (`VP8X`), with 24-bit sizes. */
export function webpExtended(width: number, height: number): Buffer {
  const w = width - 1;
  const h = height - 1;
  const payload = [
    0,
    0,
    0,
    0,
    w & 0xff,
    (w >>> 8) & 0xff,
    (w >>> 16) & 0xff,
    h & 0xff,
    (h >>> 8) & 0xff,
    (h >>> 16) & 0xff,
  ];
  return Buffer.from([
    ...text('RIFF'),
    0,
    0,
    0,
    0,
    ...text('WEBP'),
    ...text('VP8X'),
    payload.length,
    0,
    0,
    0,
    ...payload,
  ]);
}

export const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
);
export const html = Buffer.from('<!doctype html><script>alert(1)</script>');
export const gif = Buffer.from([...text('GIF89a'), 0x0a, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x3b]);
