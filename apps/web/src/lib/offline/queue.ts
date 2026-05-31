import { isAxiosError } from 'axios';
import { api } from '../api/axios';
import { idbCount, idbDelete, idbGetAll, idbPut, type QueuedWrite } from './db';

/**
 * Offline write queue (CLAUDE.md §8). Writes attempted while offline — or that
 * fail with a network error — are persisted in IndexedDB and replayed when the
 * browser reconnects. Each carries a stable `clientRequestId`, so the gateway's
 * conditional-create upserts on replay instead of duplicating (and never
 * re-fires the alert/timer for a reading that already landed).
 */

/** Window event dispatched whenever the queue changes (enqueue / replay). */
export const QUEUE_CHANGED_EVENT = 'hphii:offline-queue-changed';

function emitQueueChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(QUEUE_CHANGED_EVENT));
  }
}

/** True when an error means "the request never reached the server" (no response). */
export function isNetworkError(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  // axios sets a response only when the server answered; its absence (plus a
  // request object) means the network dropped, timed out, or CORS-failed.
  return error.response === undefined;
}

/**
 * A 4xx (other than auth/timeout/rate-limit) is the server rejecting the body —
 * it will never succeed on retry, so it must be dropped rather than wedging the
 * queue. 401 is handled by the axios refresh interceptor; 408/429 are transient.
 */
function isPermanentRejection(error: unknown): boolean {
  if (!isAxiosError(error) || !error.response) return false;
  const status = error.response.status;
  return status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429;
}

export async function enqueueWrite(input: {
  url: string;
  body: Record<string, unknown>;
  label: string;
  id: string;
}): Promise<QueuedWrite> {
  const record: QueuedWrite = {
    id: input.id,
    method: 'POST',
    url: input.url,
    body: input.body,
    label: input.label,
    createdAt: new Date().toISOString(),
  };
  await idbPut(record);
  emitQueueChanged();
  return record;
}

export function listQueuedWrites(): Promise<QueuedWrite[]> {
  return idbGetAll();
}

export function pendingCount(): Promise<number> {
  return idbCount();
}

export interface ReplayOutcome {
  replayed: number;
  dropped: number;
  remaining: number;
}

/**
 * Replay every queued write in FIFO order. Successful and permanently-rejected
 * writes are removed; transient failures (still offline, 5xx) are kept for the
 * next reconnect. Safe to call repeatedly — concurrent calls are de-duplicated.
 */
let replayInFlight: Promise<ReplayOutcome> | null = null;

export function replayAll(): Promise<ReplayOutcome> {
  replayInFlight ??= runReplay().finally(() => {
    replayInFlight = null;
  });
  return replayInFlight;
}

async function runReplay(): Promise<ReplayOutcome> {
  const items = (await idbGetAll()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let replayed = 0;
  let dropped = 0;

  for (const item of items) {
    try {
      await api.request({ method: item.method, url: item.url, data: item.body });
      await idbDelete(item.id);
      replayed += 1;
    } catch (error) {
      if (isPermanentRejection(error)) {
        await idbDelete(item.id);
        dropped += 1;
        continue;
      }
      // Transient (offline again / 5xx): stop and keep the rest for later.
      break;
    }
  }

  if (replayed > 0 || dropped > 0) emitQueueChanged();
  return { replayed, dropped, remaining: await idbCount() };
}

/** Result of a write that may have been applied online or queued for later. */
export type SubmitResult<T> =
  | { queued: false; data: T; clientRequestId: string }
  | { queued: true; clientRequestId: string };

/**
 * POST `body` to `url`, or queue it if the device is offline / the network drops
 * mid-flight. A `clientRequestId` is generated (and merged into the body) so the
 * eventual replay is idempotent at the gateway. Non-network errors (validation,
 * auth) reject so the caller can surface them.
 */
export async function postOrQueue<T, B extends object = Record<string, unknown>>(opts: {
  url: string;
  body: B;
  label: string;
}): Promise<SubmitResult<T>> {
  const existing = (opts.body as Record<string, unknown>).clientRequestId;
  const clientRequestId = typeof existing === 'string' ? existing : crypto.randomUUID();
  const body: Record<string, unknown> = { ...opts.body, clientRequestId };

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await enqueueWrite({ url: opts.url, body, label: opts.label, id: clientRequestId });
    return { queued: true, clientRequestId };
  }

  try {
    const { data } = await api.post<T>(opts.url, body);
    return { queued: false, data, clientRequestId };
  } catch (error) {
    if (isNetworkError(error)) {
      await enqueueWrite({ url: opts.url, body, label: opts.label, id: clientRequestId });
      return { queued: true, clientRequestId };
    }
    throw error;
  }
}
