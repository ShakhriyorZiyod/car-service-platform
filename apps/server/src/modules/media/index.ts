/**
 * The media module (docs/PLAN.md, sections 4.9 and 7.11): photos kept in the file store, their type
 * found out from the bytes, shown through signed links. It has no rules about who may see what:
 * the reception and tasks modules decide that and ask it for a link.
 */
import { createMediaService, type MediaService, type MediaServiceDeps } from './app/media';

export function createMedia(deps: MediaServiceDeps): MediaService {
  return createMediaService(deps);
}

export type { MediaOwner, MediaService, Photo, PhotoUpload } from './app/media';
export { readImage } from './domain/image';
export { registerMediaRoute } from './http/routes';
