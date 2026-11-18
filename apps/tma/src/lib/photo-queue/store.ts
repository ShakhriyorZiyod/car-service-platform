/**
 * What the master has done that the server does not know yet (docs/PLAN.md, stage 5): the photos
 * taken and the reports handed in while there was no connection. They are kept on the phone in
 * IndexedDB, so closing the app or losing the signal loses nothing, and are sent in the order they
 * were made.
 */

export interface QueuedPhoto {
  seq: number;
  kind: 'photo';
  taskId: string;
  /** The id the photo will have on the server: sending it again is harmless. */
  mediaId: string;
  photoKind: 'before' | 'after';
  bytes: ArrayBuffer;
  createdAt: number;
}

export interface QueuedSubmit {
  seq: number;
  kind: 'submit';
  taskId: string;
  comment: string;
  createdAt: number;
}

export type QueuedOp = QueuedPhoto | QueuedSubmit;

/** An operation as it is added: the store gives it its place in the line. */
export type NewOp =
  Omit<QueuedPhoto, 'seq' | 'createdAt'> | Omit<QueuedSubmit, 'seq' | 'createdAt'>;

const DB_NAME = 'cs-master';
const STORE = 'queue';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'seq', autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('could not open the queue'));
  });
}

function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = work(transaction.objectStore(STORE));
        transaction.oncomplete = () => {
          db.close();
          resolve(request.result);
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error ?? new Error('queue failed'));
        };
        transaction.onabort = transaction.onerror;
      }),
  );
}

/** The line, oldest first. */
export async function listOps(): Promise<QueuedOp[]> {
  // What IndexedDB hands back is not typed: it holds only what `addOp` put in.
  const rows: unknown = await run('readonly', (store) => store.getAll());
  return rows as QueuedOp[];
}

export const addOp = (op: NewOp): Promise<number> =>
  run('readwrite', (store) => store.add({ ...op, createdAt: Date.now() })).then((key) =>
    Number(key),
  );

export const removeOp = (seq: number): Promise<undefined> =>
  run('readwrite', (store) => store.delete(seq));
