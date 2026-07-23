import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// PWA: offline-first per ARCHITECTURE.md §2/§5. Chromium desktop + Android Chrome installable;
// Firefox desktop runs as an offline-capable tab (no install) but the service worker still works.
export default defineConfig({
  resolve: {
    // '@/' → src/ path alias (mirrors tsconfig.app.json paths). Build-time only, no runtime cost.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // no-network gate (ARCHITECTURE §9): only same-origin assets are ever cached/fetched.
        // .wasm must be included — the actual FaceLandmarker runtime binaries live in
        // public/wasm/ (largest is ~10.6MB) and must be precached for true offline support
        // (ARCHITECTURE §5: "PWA fully offline after first load, verified in airplane mode").
        globPatterns: ['**/*.{js,css,html,ico,png,svg,task,wasm}'],
        // Dev-only overlays/harnesses under src/dev/ are never reachable in a production build
        // (import.meta.env.DEV dead-branch elimination), but Rollup can still emit an ORPHAN
        // chunk for a dynamic import that lives inside a closure. No app chunk references it;
        // without this ignore the precache glob would sweep that orphan into the service worker
        // and ship dev code to users.
        globIgnores: ['**/{DebugOverlay,DebugHud,LiveDemoView,LiveV1Harness,CaptureHarness}-*.js'],
        // Default 2MiB cap rejects face_landmarker.task (~3.76MB) and every wasm runtime file;
        // raised with headroom above the largest shipped asset.
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
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
