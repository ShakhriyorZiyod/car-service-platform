import { useT } from '../i18n';
import { useOnline } from '../lib/online';
import { useQueue } from '../lib/photo-queue/QueueProvider';
import { Button } from './Button';

/**
 * Says what has not reached the server yet: the photos and reports waiting for a connection, and
 * the ones the server refused (the task changed, the file was not a picture).
 */
export function QueueBanner() {
  const t = useT().master;
  const online = useOnline();
  const queue = useQueue();
  const waiting = queue.ops.length;
  if (waiting === 0 && queue.failed.length === 0 && online) return null;
  return (
    <div className="master-banner" role="status">
      {!online && <p>{t.errors.network}</p>}
      {waiting > 0 && (
        <p>
          {t.pending(waiting)}. {t.pendingHint}{' '}
          {online && (
            <Button variant="link" onClick={queue.retryNow}>
              {t.retry}
            </Button>
          )}
        </p>
      )}
      {queue.failed.length > 0 && (
        <p className="master-banner__failed">
          {t.failed(queue.failed.length)}:{' '}
          {t.errors[queue.failed[0]?.code ?? ''] ?? t.errors.generic ?? ''}{' '}
          <Button variant="link" onClick={queue.dismissFailures}>
            {t.dismiss}
          </Button>
        </p>
      )}
    </div>
  );
}
