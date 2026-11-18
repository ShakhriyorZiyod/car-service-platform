import type { PhotoMime } from '@cs/shared/vocabulary';

/**
 * What a photo really is, found out from its bytes (docs/PLAN.md, section 4.9): the name and the
 * type the client sent are never believed. Only JPEG, PNG and WebP pass; SVG, HTML and everything
 * else are refused because their first bytes are not one of these.
 */
export interface ImageFacts {
  mime: PhotoMime;
  width: number;
  height: number;
}

/** A phone's photo is a few thousand pixels wide; far more is not a photo. */
const MAX_SIDE = 20_000;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const startsWith = (bytes: Uint8Array, signature: readonly number[], at = 0): boolean =>
  signature.every((value, index) => bytes[at + index] === value);

const ascii = (bytes: Uint8Array, at: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(at, at + length));

const valid = (width: number, height: number): boolean =>
  width > 0 && height > 0 && width <= MAX_SIDE && height <= MAX_SIDE;

/** Start-of-frame markers carry the size; C4 (tables), C8 and CC are not frames. */
const isFrameMarker = (marker: number): boolean =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

function readJpeg(bytes: Uint8Array): ImageFacts | null {
  if (!startsWith(bytes, [0xff, 0xd8, 0xff])) return null;
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null;
    let marker = bytes[at + 1] ?? 0;
    // Fill bytes (extra 0xFF) may precede a marker.
    while (marker === 0xff && at + 2 < bytes.length) {
      at += 1;
      marker = bytes[at + 1] ?? 0;
    }
    // Markers without a length: restart markers, TEM and the start of image.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      at += 2;
      continue;
    }
    // The scan begins or the picture ends before any frame header was met.
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0);
    if (length < 2) return null;
    if (isFrameMarker(marker)) {
      if (at + 9 > bytes.length) return null;
      const height = ((bytes[at + 5] ?? 0) << 8) | (bytes[at + 6] ?? 0);
      const width = ((bytes[at + 7] ?? 0) << 8) | (bytes[at + 8] ?? 0);
      return valid(width, height) ? { mime: 'image/jpeg', width, height } : null;
    }
    at += 2 + length;
  }
  return null;
}

function readPng(bytes: Uint8Array): ImageFacts | null {
  if (!startsWith(bytes, PNG_SIGNATURE) || bytes.length < 24) return null;
  // The first chunk is always IHDR, 13 bytes long.
  if (ascii(bytes, 12, 4) !== 'IHDR') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return valid(width, height) ? { mime: 'image/png', width, height } : null;
}

function readWebp(bytes: Uint8Array): ImageFacts | null {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') {
    return null;
  }
  const chunk = ascii(bytes, 12, 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width: number;
  let height: number;
  if (chunk === 'VP8 ') {
    // Lossy: a frame tag, the start code 9D 01 2A, then 14-bit sizes.
    if (!startsWith(bytes, [0x9d, 0x01, 0x2a], 23)) return null;
    width = view.getUint16(26, true) & 0x3fff;
    height = view.getUint16(28, true) & 0x3fff;
  } else if (chunk === 'VP8L') {
    // Lossless: the signature 0x2F, then two 14-bit sizes (each minus one) in 28 bits.
    if (bytes[20] !== 0x2f) return null;
    const bits = view.getUint32(21, true);
    width = (bits & 0x3fff) + 1;
    height = ((bits >>> 14) & 0x3fff) + 1;
  } else if (chunk === 'VP8X') {
    // Extended: 24-bit sizes (each minus one) after the flags.
    width = ((bytes[24] ?? 0) | ((bytes[25] ?? 0) << 8) | ((bytes[26] ?? 0) << 16)) + 1;
    height = ((bytes[27] ?? 0) | ((bytes[28] ?? 0) << 8) | ((bytes[29] ?? 0) << 16)) + 1;
  } else {
    return null;
  }
  return valid(width, height) ? { mime: 'image/webp', width, height } : null;
}

/** The picture's type and size, or null when the bytes are not a JPEG, PNG or WebP picture. */
export function readImage(bytes: Uint8Array): ImageFacts | null {
  return readJpeg(bytes) ?? readPng(bytes) ?? readWebp(bytes);
}
