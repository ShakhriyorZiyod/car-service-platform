/**
 * A photo is shrunk on the device to about two megapixels before it is sent (docs/PLAN.md, section
 * 4.9): the camera's picture is several times bigger than the server accepts or the report needs.
 */

const MAX_PIXELS = 2_000_000;
const QUALITY = 0.85;

/** The picture of a file as JPEG bytes, at most about 2 Mp. */
export async function shrinkPhoto(file: Blob): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (bitmap.width * bitmap.height)));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no canvas');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  );
  if (!blob) throw new Error('could not encode the photo');
  return new Uint8Array(await blob.arrayBuffer());
}

/** A fresh id for a photo: the same one is sent again if the send must be repeated. */
export const newPhotoId = (): string => crypto.randomUUID();
