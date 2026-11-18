import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * A link to a photo is its own permission (docs/PLAN.md, sections 4.9 and 15): it is signed with
 * the server's secret, names the photo and an end time, and is only handed to people who may see
 * the photo. A person who has not the link cannot guess one.
 */

/** How long a link works. */
export const MEDIA_LINK_SECONDS = 15 * 60;

const sign = (secret: string, mediaId: string, expires: number): string =>
  createHmac('sha256', secret).update(`${mediaId}.${expires}`).digest('base64url');

export interface MediaLink {
  expires: number;
  signature: string;
}

/** Links made within this many seconds of each other are the same. */
const LINK_STEP_SECONDS = 5 * 60;

/**
 * The end time is rounded down to a five-minute step, so a screen that refreshes every few seconds
 * gets the same link and the browser shows the photo from its cache instead of loading it again.
 * A link therefore works between 10 and 15 minutes, never longer.
 */
export function signMediaLink(secret: string, mediaId: string, now: Date): MediaLink {
  const latest = Math.floor(now.getTime() / 1000) + MEDIA_LINK_SECONDS;
  const expires = Math.floor(latest / LINK_STEP_SECONDS) * LINK_STEP_SECONDS;
  return { expires, signature: sign(secret, mediaId, expires) };
}

/** True only for a link we signed for this photo that has not run out. */
export function isValidMediaLink(
  secret: string,
  mediaId: string,
  link: { expires: number; signature: string },
  now: Date,
): boolean {
  if (!Number.isInteger(link.expires) || link.expires * 1000 <= now.getTime()) return false;
  const expected = Buffer.from(sign(secret, mediaId, link.expires));
  const given = Buffer.from(link.signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The path and query the client opens: `/media/<id>?exp=<seconds>&sig=<signature>`. */
export const mediaPath = (mediaId: string, link: MediaLink): string =>
  `/media/${mediaId}?exp=${link.expires}&sig=${link.signature}`;
