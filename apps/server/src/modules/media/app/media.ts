import { LIMITS, type MediaPurpose, type PhotoMime, type PhotoSide } from '@cs/shared/vocabulary';
import { and, asc, eq } from 'drizzle-orm';
import type { DbOrTx, Tx } from '../../../db/client';
import { media } from '../../../db/schema';
import { newId } from '../../../lib/ids';
import type { PlatformDeps } from '../../../platform/deps';
import { AppError } from '../../../platform/errors';
import type { FileStore } from '../../../platform/ports';
import { readImage } from '../domain/image';
import { isValidMediaLink, mediaPath, signMediaLink } from '../domain/signed-url';

/**
 * Photos (docs/PLAN.md, sections 4.9 and 7.11): the type is found out from the bytes, the size is
 * limited, a repeated upload of the same id keeps one photo, and a photo is shown only through a
 * signed link. Who may upload or see a photo is the caller's rule: the module that owns the act or
 * the task has checked it before it calls here.
 */

export type MediaOwner =
  { kind: 'act'; actId: string } | { kind: 'task'; taskId: string; attempt: number };

export interface PhotoUpload {
  /** The client makes it, so sending the same photo twice cannot make two. */
  id: string;
  purpose: MediaPurpose;
  /** Which side of the car; only for `reception_side`. */
  side: PhotoSide | null;
  owner: MediaOwner;
  bytes: Uint8Array;
  uploadedBy: string;
}

export interface Photo {
  id: string;
  purpose: MediaPurpose;
  side: PhotoSide | null;
  receptionActId: string | null;
  taskId: string | null;
  attempt: number | null;
  mime: PhotoMime;
  bytes: number;
  width: number;
  height: number;
  createdAt: Date;
}

export interface MediaServiceDeps extends PlatformDeps {
  files: FileStore;
  /** Signs the links. */
  secret: string;
}

export interface MediaService {
  /**
   * Keeps the photo, inside the caller's transaction. The same id with the same meaning gives the
   * photo that is already there; a new photo of a side replaces the old one.
   */
  put(tx: Tx, upload: PhotoUpload): Promise<Photo>;
  /** Removes a photo and its file. The caller has made sure it may. */
  remove(tx: Tx, id: string): Promise<void>;
  /** The photos of an act. */
  ofAct(from: DbOrTx, actId: string): Promise<Photo[]>;
  /** The photos of a task: one attempt, or all of them. */
  ofTask(from: DbOrTx, taskId: string, attempt?: number): Promise<Photo[]>;
  /** A photo by its id, or null. */
  find(from: DbOrTx, id: string): Promise<Photo | null>;
  /** The signed path to open a photo for the next 15 minutes. */
  link(id: string): string;
  /** The file behind a link, or null when the link is wrong, has run out or the photo is gone. */
  open(
    id: string,
    expires: number,
    signature: string,
  ): Promise<{ bytes: Buffer; mime: string } | null>;
}

type MediaRow = typeof media.$inferSelect;

const toPhoto = (row: MediaRow): Photo => ({
  id: row.id,
  purpose: row.purpose,
  side: row.side,
  receptionActId: row.receptionActId,
  taskId: row.taskId,
  attempt: row.attempt,
  mime: row.mime as PhotoMime,
  bytes: row.bytes,
  width: row.width,
  height: row.height,
  createdAt: row.createdAt,
});

const invalidPhoto = (reason: string) => new AppError('invalid_photo', reason);

export function createMediaService(deps: MediaServiceDeps): MediaService {
  const { db, clock, files, secret, logger } = deps;

  /** A failed delete leaves a stray file, never a wrong answer: it is logged and let go. */
  async function dropFile(key: string): Promise<void> {
    try {
      await files.delete(key);
    } catch (error) {
      logger.warn({ err: error }, 'could not delete a photo file');
    }
  }

  function checkMeaning(upload: PhotoUpload): void {
    const { purpose, owner, side } = upload;
    const forAct = purpose === 'reception_side' || purpose === 'reception_defect';
    if (forAct !== (owner.kind === 'act')) throw new AppError('validation', 'photo purpose');
    if ((purpose === 'reception_side') !== (side !== null)) {
      throw new AppError('validation', 'photo side', { paths: ['query.side'] });
    }
  }

  const sameMeaning = (row: MediaRow, upload: PhotoUpload): boolean =>
    row.purpose === upload.purpose &&
    row.side === upload.side &&
    (upload.owner.kind === 'act'
      ? row.receptionActId === upload.owner.actId
      : row.taskId === upload.owner.taskId && row.attempt === upload.owner.attempt);

  return {
    async put(tx, upload) {
      checkMeaning(upload);
      const [existing] = await tx.select().from(media).where(eq(media.id, upload.id));
      if (existing) {
        // Sending it again is fine; using the id for something else is not.
        if (!sameMeaning(existing, upload)) {
          throw new AppError('validation', 'photo id is taken', { paths: ['params.mediaId'] });
        }
        return toPhoto(existing);
      }

      if (upload.bytes.length === 0 || upload.bytes.length > LIMITS.photoBytes.max) {
        throw invalidPhoto('size');
      }
      const facts = readImage(upload.bytes);
      if (!facts) throw invalidPhoto('type');

      // A new photo of a side takes the old one's place.
      let replacedKey: string | null = null;
      if (upload.purpose === 'reception_side' && upload.owner.kind === 'act') {
        const [old] = await tx
          .select()
          .from(media)
          .where(
            and(
              eq(media.receptionActId, upload.owner.actId),
              eq(media.purpose, 'reception_side'),
              eq(media.side, upload.side as PhotoSide),
            ),
          );
        if (old) {
          await tx.delete(media).where(eq(media.id, old.id));
          replacedKey = old.storageKey;
        }
      }

      const storageKey = newId();
      await files.put(storageKey, upload.bytes);
      try {
        const [row] = await tx
          .insert(media)
          .values({
            id: upload.id,
            purpose: upload.purpose,
            side: upload.side,
            receptionActId: upload.owner.kind === 'act' ? upload.owner.actId : null,
            taskId: upload.owner.kind === 'task' ? upload.owner.taskId : null,
            attempt: upload.owner.kind === 'task' ? upload.owner.attempt : null,
            storageKey,
            mime: facts.mime,
            bytes: upload.bytes.length,
            width: facts.width,
            height: facts.height,
            uploadedBy: upload.uploadedBy,
            createdAt: clock.now(),
          })
          .returning();
        if (!row) throw new Error('insert returned no row');
        if (replacedKey) await dropFile(replacedKey);
        return toPhoto(row);
      } catch (error) {
        await dropFile(storageKey);
        throw error;
      }
    },

    async remove(tx, id) {
      const [row] = await tx.delete(media).where(eq(media.id, id)).returning();
      if (row) await dropFile(row.storageKey);
    },

    async ofAct(from, actId) {
      const rows = await from
        .select()
        .from(media)
        .where(eq(media.receptionActId, actId))
        .orderBy(asc(media.createdAt), asc(media.id));
      return rows.map(toPhoto);
    },

    async ofTask(from, taskId, attempt) {
      const rows = await from
        .select()
        .from(media)
        .where(
          attempt === undefined
            ? eq(media.taskId, taskId)
            : and(eq(media.taskId, taskId), eq(media.attempt, attempt)),
        )
        .orderBy(asc(media.createdAt), asc(media.id));
      return rows.map(toPhoto);
    },

    async find(from, id) {
      const [row] = await from.select().from(media).where(eq(media.id, id));
      return row ? toPhoto(row) : null;
    },

    link: (id) => mediaPath(id, signMediaLink(secret, id, clock.now())),

    async open(id, expires, signature) {
      if (!isValidMediaLink(secret, id, { expires, signature }, clock.now())) return null;
      const [row] = await db.select().from(media).where(eq(media.id, id));
      if (!row) return null;
      const bytes = await files.get(row.storageKey);
      return bytes ? { bytes, mime: row.mime } : null;
    },
  };
}
