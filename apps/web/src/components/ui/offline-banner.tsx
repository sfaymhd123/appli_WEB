import { useOfflineQueue } from '../../lib/offline';

/**
 * Connectivity + background-sync strip (CLAUDE.md §8). Mounted once in the app
 * shell, it owns the single offline-queue watcher: it shows an offline notice,
 * a "syncing" notice while queued writes replay on reconnect, and a count of
 * writes still waiting. The PWA service worker serves the cached shell so the
 * app stays usable; writes queue locally until connectivity returns.
 */
export function OfflineBanner() {
  const { online, pending, replaying } = useOfflineQueue();

  if (!online) {
    return (
      <Strip tone="amber">
        <span aria-hidden>●</span>
        Mode hors ligne — données issues du cache local.
        {pending > 0 && <Count>{pending} écriture(s) en attente</Count>}
      </Strip>
    );
  }

  if (replaying) {
    return (
      <Strip tone="clinical">
        <span aria-hidden>↻</span>
        Synchronisation des données enregistrées hors ligne…
      </Strip>
    );
  }

  if (pending > 0) {
    return (
      <Strip tone="clinical">
        <span aria-hidden>↻</span>
        {pending} écriture(s) en attente de synchronisation.
      </Strip>
    );
  }

  return null;
}

const TONE: Record<'amber' | 'clinical', string> = {
  amber: 'bg-amber-500 text-white',
  clinical: 'bg-clinical-600 text-white',
};

function Strip({ tone, children }: { tone: 'amber' | 'clinical'; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={`flex items-center justify-center gap-2 px-4 py-2 text-center text-sm font-semibold ${TONE[tone]}`}
    >
      {children}
    </div>
  );
}

function Count({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-2 rounded-full bg-white/25 px-2 py-0.5 text-xs font-bold">{children}</span>
  );
}
