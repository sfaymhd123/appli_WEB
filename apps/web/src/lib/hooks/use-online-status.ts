import { useEffect, useState } from 'react';
import axios from 'axios';

/**
 * Tracks real connectivity for offline-first UX (ARCH.md §8).
 * Combines browser 'online' event with a periodic heartbeat ping to the gateway.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => {
      console.log('[Network] Browser went online, checking server...');
      void checkHeartbeat();
    };
    const goOffline = () => {
      console.log('[Network] Browser went offline');
      setOnline(false);
    };

    const checkHeartbeat = async () => {
      // If browser says offline, we ARE offline.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setOnline(false);
        return;
      }

      try {
        const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
        // Ping the server
        await axios.get(`${baseUrl}/health`, { 
          timeout: 2000,
          headers: { 'Cache-Control': 'no-cache' } 
        });
        setOnline(true);
      } catch (err) {
        // If server is down, we consider the app "offline" even if wifi is on
        setOnline(false);
      }
    };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    // Initial check
    void checkHeartbeat();

    // Regular heartbeat every 10s for faster feedback
    const interval = setInterval(() => void checkHeartbeat(), 10000);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearInterval(interval);
    };
  }, []);

  return online;
}
