import { useEffect, useRef } from 'react';
import { getAccessToken } from '../../auth/token-store';
import type { AlertEventKind, AlertStreamEvent } from '../types/monitoring';

// VITE_* is exposed to the browser — NEVER put secrets here (CLAUDE.md §9).
const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

const EVENT_KINDS: AlertEventKind[] = [
  'alert.created',
  'alert.acknowledged',
  'alert.resolved',
  'alert.escalated',
  'careplan.review-needed',
];

/**
 * Subscribe to the gateway's Server-Sent Events stream of in-app notifications.
 * EventSource cannot send an Authorization header, so the access token is passed
 * as a `?token=` query param (verified server-side with the same RS256 keys).
 * This is the instant-toast path; the dashboard's authoritative data still comes
 * from TanStack Query polling, so a dropped stream never loses an alert.
 */
export function useAlertStream(onEvent: (event: AlertStreamEvent) => void): void {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    const source = new EventSource(`${baseURL}/alerts/stream?token=${encodeURIComponent(token)}`);

    const listeners = EVENT_KINDS.map((kind) => {
      const listener = (event: MessageEvent<string>) => {
        try {
          handler.current(JSON.parse(event.data) as AlertStreamEvent);
        } catch {
          /* ignore malformed frames */
        }
      };
      source.addEventListener(kind, listener as EventListener);
      return { kind, listener };
    });

    return () => {
      for (const { kind, listener } of listeners) {
        source.removeEventListener(kind, listener as EventListener);
      }
      source.close();
    };
  }, []);
}
