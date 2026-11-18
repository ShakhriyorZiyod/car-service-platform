import { Camera } from 'lucide-react';
import { useRef, useState } from 'react';
import { useT } from '../i18n';
import { shrinkPhoto } from '../lib/photo';

/**
 * A photo, or a dashed tile to take one (design A2, CaptureTile). Taking a photo opens the camera
 * (or the file picker on a computer), shrinks the picture and gives the bytes to `onPhoto`.
 */
export function PhotoTile({
  url,
  label,
  busy = false,
  disabled = false,
  onPhoto,
  onOpen,
}: {
  url: string | null;
  label: string;
  busy?: boolean;
  disabled?: boolean;
  onPhoto: (bytes: Uint8Array) => void | Promise<void>;
  /** Looking at a taken photo bigger. */
  onOpen?: () => void;
}) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [shrinking, setShrinking] = useState(false);
  const working = busy || shrinking;

  const take = async (file: File | undefined) => {
    if (!file) return;
    setShrinking(true);
    try {
      await onPhoto(await shrinkPhoto(file));
    } finally {
      setShrinking(false);
      // The same file may be chosen again.
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="photo-tile">
      {url ? (
        <button type="button" className="photo-tile__image" onClick={onOpen} aria-label={label}>
          <img src={url} alt={label} loading="lazy" />
        </button>
      ) : (
        <button
          type="button"
          className="photo-tile__capture"
          disabled={disabled || working}
          onClick={() => input.current?.click()}
        >
          <Camera size={22} aria-hidden="true" />
          <span>{working ? t.reception.uploading : t.reception.takePhoto}</span>
        </button>
      )}
      {url && !disabled && (
        <button
          type="button"
          className="photo-tile__retake"
          disabled={working}
          onClick={() => input.current?.click()}
        >
          {working ? t.reception.uploading : t.reception.retake}
        </button>
      )}
      <span className="photo-tile__label">{label}</span>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="visually-hidden"
        tabIndex={-1}
        onChange={(event) => void take(event.target.files?.[0])}
      />
    </div>
  );
}
