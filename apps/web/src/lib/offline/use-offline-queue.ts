import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOnlineStatus } from '../hooks/use-online-status';
import { pendingCount, QUEUE_CHANGED_EVENT, replayAll } from './queue';

export interface OfflineQueueState {
  /** Number of writes waiting to sync. */
  pending: number;
  /** True while a replay batch is in flight. */
  replaying: boolean;
  online: boolean;
}

/**
 * Observes the offline write queue and drains it on reconnect (ARCH.md §8).
 * Mount once near the app shell. On transition to online it replays queued
 * writes, then invalidates the triage/monitoring queries so freshly-synced
 * resources appear without a manual refresh.
 */
export function useOfflineQueue(): OfflineQueueState {
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(0);
  const [replaying, setReplaying] = useState(false);

  const refresh = useCallback(async () => {
    setPending(await pendingCount());
  }, []);

  // Keep the badge in sync with enqueue/replay events from anywhere in the app.
  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(QUEUE_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(QUEUE_CHANGED_EVENT, onChange);
  }, [refresh]);

  // Drain the queue whenever we (re)gain connectivity.
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    void (async () => {
      if ((await pendingCount()) === 0) return;
      setReplaying(true);
      try {
        const outcome = await replayAll();
        if (outcome.replayed > 0) {
          await queryClient.invalidateQueries({ queryKey: ['triage'] });
          await queryClient.invalidateQueries({ queryKey: ['monitoring'] });
        }
      } finally {
        if (!cancelled) {
          setReplaying(false);
          void refresh();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [online, queryClient, refresh]);

  return { pending, replaying, online };
}
