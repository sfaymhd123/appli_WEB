import { useOnlineStatus } from '../../lib/hooks/use-online-status';

/**
 * Slim banner shown only while offline. The PWA service worker serves the
 * cached shell, so the app stays usable; writes queue until reconnection.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-white"
    >
      <span aria-hidden>●</span>
      Mode hors ligne — les données affichées proviennent du cache local.
    </div>
  );
}
