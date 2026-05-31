import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Keep the service worker out of the dev server (avoids cache surprises).
      devOptions: { enabled: false },
      workbox: {
        // SPA client-side routes resolve to the cached shell when offline.
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Offline reads (CLAUDE.md §8): cache the gateway's GET responses and
            // serve them from cache when the network is unavailable. Cross-origin
            // only (the API on :3000) so it never shadows the SPA's own routes.
            // PoC note: keyed by URL, so it assumes a single signed-in user/device.
            urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
              !sameOrigin &&
              /\/(patients|alerts|observations|triage|dsp|care-plans|services|analytics|kpis|fhir|metadata)\b/.test(
                url.pathname,
              ),
            handler: 'NetworkFirst',
            method: 'GET',
            options: {
              cacheName: 'hphii-api-reads',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'HPHII Shared Health Record',
        short_name: 'HPHII SHR',
        description:
          'Dossier de Santé Partagé — Hôpital Provincial Hassan II de Settat',
        theme_color: '#0f766e',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
