import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// PWA: offline-first per ARCHITECTURE.md §2/§5. Chromium desktop + Android Chrome installable;
// Firefox desktop runs as an offline-capable tab (no install) but the service worker still works.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // no-network gate (ARCHITECTURE §9): only same-origin assets are ever cached/fetched.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,task}'],
      },
      manifest: {
        name: 'MirrorWell',
        short_name: 'MirrorWell',
        description: 'Private, on-device facial-exercise tracking. No network, no accounts.',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [],
      },
    }),
  ],
});
