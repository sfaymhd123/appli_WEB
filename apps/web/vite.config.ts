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
