import type { MasterTask } from '@cs/shared';
import { formatDuration } from '@cs/shared/format';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../../../bootstrap';
import { useLang, useT } from '../../../i18n';
import { useBack } from '../../../lib/back';
import { newPhotoId, shrinkPhoto } from '../../../lib/photo';
import { Button } from '../../../ui/Button';
import { BottomBar, PlateChip, Skeleton } from '../../../ui/client-parts';
import { Notice } from '../../../ui/Notice';
import { errorText, taskKey, taskListKey, useTask } from '../data';
import { useQueue } from '../../../lib/photo-queue/QueueProvider';
import type { QueuedPhoto } from '../../../lib/photo-queue/store';
import { MasterTimer } from '../../../ui/MasterTimer';
import { MASTER_TASK_TABS } from '@cs/shared/vocabulary';

/**
 * U2 and U3 in one: before the start (the instruction and the defects the client confirmed) and
 * during the work (photos before and after, a word to the admin, the report). Photos and the
 * report go through the queue, so they are kept and sent later when there is no connection.
 */
export function TaskScreen({ taskId, onBack }: { taskId: string; onBack: () => void }) {
  const t = useT().master;
  const lang = useLang();
  const api = useApi();
  const queryClient = useQueryClient();
  const queue = useQueue();
  const task = useTask(taskId);
  const [comment, setComment] = useState('');
  const [photoError, setPhotoError] = useState<unknown>(null);
  useBack(onBack);

  const data = task.data;
  const refresh = async (updated?: MasterTask) => {
    if (updated) queryClient.setQueryData(taskKey(taskId), updated);
    await Promise.all(
      MASTER_TASK_TABS.map((tab) => queryClient.invalidateQueries({ queryKey: taskListKey(tab) })),
    );
  };

  const start = useMutation({
    mutationFn: () => api.call('master.startTask', { params: { id: taskId } }),
    onSuccess: refresh,
  });
  const removePhoto = useMutation({
    mutationFn: (mediaId: string) =>
      api.call('master.deleteTaskPhoto', { params: { id: taskId, mediaId } }),
    onSuccess: () => task.refetch(),
  });

  const queued = queue.ops.filter(
    (op): op is QueuedPhoto => op.kind === 'photo' && op.taskId === taskId,
  );
  const submitQueued = queue.ops.some((op) => op.kind === 'submit' && op.taskId === taskId);
  const photos = (kind: 'before' | 'after') => ({
    sent: data?.photos.filter((photo) => photo.kind === kind) ?? [],
    waiting: queued.filter((photo) => photo.photoKind === kind),
  });
  const before = photos('before');
  const after = photos('after');
  const hasAfter = after.sent.length + after.waiting.length > 0;

  const take = async (kind: 'before' | 'after', file: File | undefined) => {
    if (!file) return;
    setPhotoError(null);
    try {
      const bytes = await shrinkPhoto(file);
      await queue.enqueue({
        kind: 'photo',
        taskId,
        mediaId: newPhotoId(),
        photoKind: kind,
        bytes: bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
      });
    } catch (error) {
      setPhotoError(error);
    }
  };

  const defects = data?.defects ?? [];
  const working = data?.canPhoto === true;

  return (
    <section className="screen master-task">
      {task.isPending && <Skeleton />}
      {task.isError && <Notice tone="danger">{errorText(t, task.error)}</Notice>}
      {data && (
        <>
          <header className="master-task__head">
            <span className="master-task__meta">
              {data.boxName && <span>{data.boxName}</span>}
              <span>{t.norm(formatDuration(data.normMinutes, lang))}</span>
              <span className={`master-chip master-chip--${data.status}`}>
                {t.status[data.status]}
              </span>
            </span>
            <PlateChip plate={data.car.plate} />
            <h1 className="master-task__car">{data.car.label}</h1>
            <p className="master-task__items">
              {data.items.map((item) => (lang === 'ru' ? item.nameRu : item.nameUz)).join(', ')}
            </p>
            {data.status === 'in_progress' && data.elapsedSec !== null && (
              <MasterTimer
                key={`${data.id}-${task.dataUpdatedAt}`}
                elapsedSec={data.elapsedSec}
                normMinutes={data.normMinutes}
              />
            )}
          </header>

          {data.status === 'rework' && data.lastRemark && (
            <div className="card master-remark">
              <h2 className="caption">{t.remark}</h2>
              <p>{data.lastRemark}</p>
            </div>
          )}
          {data.instruction && (
            <div className="card">
              <h2 className="caption">{t.instruction}</h2>
              <p>{data.instruction}</p>
            </div>
          )}
          {defects.length > 0 && (
            <div className="card master-defects">
              <h2 className="caption">{t.defects}</h2>
              <ul>
                {defects.map((defect, index) => (
                  <li key={defect.id}>
                    {t.defectLine(
                      index + 1,
                      t.views[defect.view],
                      t.kinds[defect.kind],
                      defect.note ?? '',
                    )}
                  </li>
                ))}
              </ul>
              <p className="caption">{t.defectsNote}</p>
            </div>
          )}

          {(working || before.sent.length + before.waiting.length > 0) && (
            <PhotoSection
              title={t.before}
              hint={t.recommend(3)}
              sent={before.sent}
              waiting={before.waiting}
              editable={working}
              onTake={(file) => void take('before', file)}
              onRemoveSent={(mediaId) => removePhoto.mutate(mediaId)}
              onRemoveWaiting={(seq) => void queue.discard(seq)}
            />
          )}
          {(working || after.sent.length + after.waiting.length > 0) && (
            <PhotoSection
              title={t.after}
              hint={t.recommend(3)}
              sent={after.sent}
              waiting={after.waiting}
              editable={working}
              onTake={(file) => void take('after', file)}
              onRemoveSent={(mediaId) => removePhoto.mutate(mediaId)}
              onRemoveWaiting={(seq) => void queue.discard(seq)}
            />
          )}
          {photoError !== null && <Notice tone="danger">{errorText(t, photoError)}</Notice>}
          {removePhoto.isError && <Notice tone="danger">{errorText(t, removePhoto.error)}</Notice>}

          {working && (
            <label className="field">
              <span className="field__label">{t.comment}</span>
              <textarea
                className="field__input master-comment"
                rows={3}
                maxLength={1000}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
            </label>
          )}
          {data.status === 'on_review' && <Notice tone="info">{t.onReview}</Notice>}
          {data.status === 'accepted' && <Notice tone="info">{t.accepted}</Notice>}
          {submitQueued && (
            <Notice tone="warning">
              {t.pending(queue.ops.length)}. {t.pendingHint}
            </Notice>
          )}
          {working && !hasAfter && <p className="caption">{t.needAfter}</p>}

          <BottomBar>
            {data.canStart && (
              <Button busy={start.isPending} onClick={() => start.mutate()}>
                {t.start}
              </Button>
            )}
            {working && (
              <Button
                className="button--dark"
                disabled={!hasAfter || submitQueued}
                onClick={() =>
                  void queue.enqueue({ kind: 'submit', taskId, comment: comment.trim() })
                }
              >
                {t.submit}
              </Button>
            )}
          </BottomBar>
          {start.isError && <Notice tone="danger">{errorText(t, start.error)}</Notice>}
        </>
      )}
    </section>
  );
}

/** A row of photos with a dashed tile to take another (design 5, PhotoTile and CaptureTile). */
function PhotoSection({
  title,
  hint,
  sent,
  waiting,
  editable,
  onTake,
  onRemoveSent,
  onRemoveWaiting,
}: {
  title: string;
  hint: string;
  sent: readonly { mediaId: string; url: string }[];
  waiting: readonly QueuedPhoto[];
  editable: boolean;
  onTake: (file: File | undefined) => void;
  onRemoveSent: (mediaId: string) => void;
  onRemoveWaiting: (seq: number) => void;
}) {
  const t = useT().master;
  const input = useRef<HTMLInputElement>(null);
  return (
    <section className="master-photos">
      <header className="master-photos__head">
        <h2 className="title">{title}</h2>
        <span className="caption">{hint}</span>
      </header>
      <div className="master-photos__grid">
        {editable && (
          <button type="button" className="master-capture" onClick={() => input.current?.click()}>
            <Camera size={22} aria-hidden="true" />
            <span>{t.takePhoto}</span>
          </button>
        )}
        {sent.map((photo) => (
          <figure key={photo.mediaId} className="master-photo">
            <img src={photo.url} alt="" loading="lazy" />
            <figcaption className="master-photo__badge master-photo__badge--done">
              {t.uploaded}
            </figcaption>
            {editable && (
              <button
                type="button"
                className="master-photo__remove"
                aria-label={t.remove}
                onClick={() => onRemoveSent(photo.mediaId)}
              >
                <span className="master-photo__remove-icon">
                  <X size={14} aria-hidden="true" />
                </span>
              </button>
            )}
          </figure>
        ))}
        {waiting.map((photo) => (
          <QueuedTile key={photo.seq} photo={photo} onRemove={() => onRemoveWaiting(photo.seq)} />
        ))}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="visually-hidden"
        tabIndex={-1}
        onChange={(event) => {
          onTake(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </section>
  );
}

/** A photo that is still on the phone: shown from its bytes, with the "queued" badge. */
function QueuedTile({ photo, onRemove }: { photo: QueuedPhoto; onRemove: () => void }) {
  const t = useT().master;
  const url = useMemo(
    () => URL.createObjectURL(new Blob([photo.bytes], { type: 'image/jpeg' })),
    [photo.bytes],
  );
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <figure className="master-photo">
      <img src={url} alt="" />
      <figcaption className="master-photo__badge">{t.queued}</figcaption>
      <button
        type="button"
        className="master-photo__remove"
        aria-label={t.remove}
        onClick={onRemove}
      >
        <span className="master-photo__remove-icon">
          <X size={14} aria-hidden="true" />
        </span>
      </button>
    </figure>
  );
}
