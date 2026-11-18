import { useState } from 'react';
import { useT } from '../i18n';
import { Dialog } from './Dialog';

/** A row of small photos; a tap opens one big (the admin checks the work by them, design A3). */
export function PhotoStrip({
  photos,
  empty,
}: {
  photos: readonly { mediaId: string; url: string; caption?: string }[];
  empty: string;
}) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const current = photos.find((photo) => photo.mediaId === open);
  if (photos.length === 0) return <p className="muted">{empty}</p>;
  return (
    <>
      <ul className="strip">
        {photos.map((photo) => (
          <li key={photo.mediaId}>
            <button
              type="button"
              className="strip__item"
              aria-label={photo.caption ?? t.tasks.photo}
              onClick={() => setOpen(photo.mediaId)}
            >
              <img src={photo.url} alt={photo.caption ?? ''} loading="lazy" />
            </button>
          </li>
        ))}
      </ul>
      {current && (
        <Dialog title={current.caption ?? t.tasks.photo} wide onClose={() => setOpen(null)}>
          <img className="strip__big" src={current.url} alt={current.caption ?? ''} />
        </Dialog>
      )}
    </>
  );
}
