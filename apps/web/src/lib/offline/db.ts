/**
 * Tiny promise-based IndexedDB wrapper for the offline write queue (CLAUDE.md §8).
 * Zero-dependency on purpose — the PoC must stay laptop-runnable and lean (§11),
 * and we only need one object store with a handful of CRUD operations.
 *
 * No PHI concern beyond what already lives in the request body the user typed;
 * nothing here is logged.
 */

const DB_NAME = 'hphii-offline';
const DB_VERSION = 1;
/** Object store holding queued write operations, keyed by their client id. */
export const WRITES_STORE = 'writes';

/** A write operation captured while offline, replayed on reconnect. */
export interface QueuedWrite {
  /** crypto.randomUUID — also sent as the body's clientRequestId for idempotency. */
  id: string;
  /** PoC only queues creates. */
  method: 'POST';
  /** Gateway path, e.g. "/triage" or "/observations". */
  url: string;
  /** Request body (already carries clientRequestId === id). */
  body: Record<string, unknown>;
  /** Human-readable label for the pending-sync UI (no PHI beyond the id). */
  label: string;
  /** ISO instant the write was queued. */
  createdAt: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WRITES_STORE)) {
        db.createObjectStore(WRITES_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
  return dbPromise;
}

/** Run `work` inside a transaction and resolve once it commits. */
async function withStore<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(WRITES_STORE, mode);
    const store = tx.objectStore(WRITES_STORE);
    let result: T | undefined;
    const request = work(store);
    if (request) request.onsuccess = () => (result = request.result);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export async function idbPut(record: QueuedWrite): Promise<void> {
  await withStore('readwrite', (store) => store.put(record));
}

export async function idbGetAll(): Promise<QueuedWrite[]> {
  const all = await withStore<QueuedWrite[]>('readonly', (store) => store.getAll());
  return all ?? [];
}

export async function idbDelete(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id));
}

export async function idbCount(): Promise<number> {
  const count = await withStore<number>('readonly', (store) => store.count());
  return count ?? 0;
}
