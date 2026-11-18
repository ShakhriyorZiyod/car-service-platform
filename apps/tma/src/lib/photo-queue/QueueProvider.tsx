import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ApiRequestError } from '../../api';
import { useApi } from '../../bootstrap';
import { addOp, listOps, removeOp, type NewOp, type QueuedOp } from './store';

/**
 * Sends the queued operations (docs/PLAN.md, stage 5): in order, one at a time, and again after a
 * pause when the network fails. A photo is sent with the id it was given, and a report is
 * repeatable on the server, so a send that was cut off is simply sent again.
 *
 * A trouble that will not go away by waiting (the task changed, the file is not a picture) drops
 * the operation and tells the master; a trouble of the line itself (no network, a server error)
 * keeps it and tries again.
 */

export interface FailedOp {
  op: QueuedOp;
  code: string;
}

interface QueueState {
  ops: readonly QueuedOp[];
  failed: readonly FailedOp[];
  enqueue(op: NewOp): Promise<void>;
  /** Takes a photo out of the line before it was sent. */
  discard(seq: number): Promise<void>;
  dismissFailures: () => void;
  retryNow: () => void;
}

const QueueContext = createContext<QueueState | null>(null);

const RETRY_MS = [3_000, 10_000, 30_000, 60_000] as const;

/** Whether waiting can help: the network, the server, a busy server, an expired launch. */
const isTransient = (error: unknown): boolean =>
  !(error instanceof ApiRequestError) ||
  error.code === 'network' ||
  error.status >= 500 ||
  error.status === 429 ||
  error.status === 401;

export function QueueProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [ops, setOps] = useState<readonly QueuedOp[]>([]);
  const [failed, setFailed] = useState<readonly FailedOp[]>([]);
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempt = useRef(0);

  const reload = useCallback(async () => {
    try {
      setOps(await listOps());
    } catch {
      // IndexedDB can be unavailable (a private window): the line then stays empty.
    }
  }, []);

  const send = useCallback(
    async (op: QueuedOp) => {
      if (op.kind === 'photo') {
        await api.call('master.putTaskPhoto', {
          params: { id: op.taskId, mediaId: op.mediaId },
          query: { kind: op.photoKind },
          body: new Uint8Array(op.bytes),
        });
      } else {
        await api.call('master.submitTask', {
          params: { id: op.taskId },
          body: { comment: op.comment },
        });
      }
    },
    [api],
  );

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      for (;;) {
        const line = await listOps();
        setOps(line);
        const next = line[0];
        if (!next) {
          attempt.current = 0;
          return;
        }
        try {
          await send(next);
          await removeOp(next.seq);
          attempt.current = 0;
          await queryClient.invalidateQueries({ queryKey: ['master'] });
        } catch (error) {
          if (isTransient(error)) {
            // Stop here: what comes after may depend on this (the report on its photos).
            const wait = RETRY_MS[Math.min(attempt.current, RETRY_MS.length - 1)] ?? 60_000;
            attempt.current += 1;
            timer.current = setTimeout(() => void run(), wait);
            return;
          }
          await removeOp(next.seq);
          const code = error instanceof ApiRequestError ? error.code : 'internal';
          setFailed((previous) => [...previous, { op: next, code }]);
          await queryClient.invalidateQueries({ queryKey: ['master'] });
        }
      }
    } finally {
      running.current = false;
    }
  }, [queryClient, send]);

  const retryNow = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    attempt.current = 0;
    void run();
  }, [run]);

  // On opening, when the connection comes back, and when the app is shown again.
  useEffect(() => {
    retryNow();
    window.addEventListener('online', retryNow);
    const visible = () => document.visibilityState === 'visible' && retryNow();
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('online', retryNow);
      document.removeEventListener('visibilitychange', visible);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [reload, retryNow]);

  const value = useMemo<QueueState>(
    () => ({
      ops,
      failed,
      enqueue: async (op) => {
        await addOp(op);
        await reload();
        retryNow();
      },
      discard: async (seq) => {
        await removeOp(seq);
        await reload();
      },
      dismissFailures: () => setFailed([]),
      retryNow,
    }),
    [ops, failed, reload, retryNow],
  );

  return <QueueContext value={value}>{children}</QueueContext>;
}

export function useQueue(): QueueState {
  const state = use(QueueContext);
  if (!state) throw new Error('useQueue must be used inside QueueProvider');
  return state;
}
