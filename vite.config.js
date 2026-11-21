import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const require = createRequire(import.meta.url);

/**
 * MapLibre v6 works out its worker URL at runtime with
 * `new URL(`./maplibre-gl-worker.mjs`, import.meta.url)`. That is not
 * statically analysable, so Vite never emits the worker and the request
 * falls through the SPA rewrite to index.html. The worker then dies trying
 * to execute HTML, and because GeoJSON is tiled in the worker the map draws
 * an empty ocean with no error anywhere.
 *
 * Copying the official worker build into public/ and pointing
 * `setWorkerUrl` at it fixes dev and production the same way, and takes the
 * file straight from the installed package so it can never drift out of
 * version with the bundled main thread.
 *
 * This runs in `configResolved`, not `buildStart`. The dev server indexes
 * public/ as it starts, so a file written any later is invisible to it and
 * the request falls through to index.html — meaning a fresh clone's first
 * `npm run dev` would serve a broken map until the server was restarted.
 */
function vendorMapLibreWorker() {
  return {
    name: 'vendor-maplibre-worker',
    configResolved() {
      const dist = dirname(require.resolve('maplibre-gl/dist/maplibre-gl.mjs'));
      const out = join(import.meta.dirname, 'public/maplibre');
      mkdirSync(out, { recursive: true });
      // The worker imports the shared chunk by relative path, so both files
      // have to sit next to each other under the same public directory.
      for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
        copyFileSync(join(dist, f), join(out, f));
      }
    },
  };
}

export default defineConfig({
  plugins: [
    vendorMapLibreWorker(),
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt', not 'autoUpdate': reloading the page mid-round would throw
      // away a score that only exists in memory until the round ends.
      registerType: 'prompt',
      // The manifest lives here so there is exactly one of it — a static copy
      // in public/ would be overwritten by the generated one at build time.
      manifest: {
        name: 'The Third Planet',
        short_name: 'Third Planet',
        description:
          'Point at the world until you know it. A zoomable map, 195 flags, and a reason to remember every one of them.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0b2429',
        theme_color: '#0b2429',
        categories: ['education', 'games'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // Every flag and the whole borders file are precached on install. It
        // is ~3 MB, which is the price of the app working on a plane — the
        // reason someone installs a study tool in the first place.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2,geojson}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Atlas mode's basemap. Tiles are optional by design: if this
            // never resolves the app falls back to the quiz basemap, which is
            // drawn entirely from the precached borders file.
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'basemap-tiles',
              expiration: { maxEntries: 900, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // MapLibre is most of the bundle and changes far less often than the
          // game does, so splitting it keeps app deploys cheap to re-download.
          maplibre: ['maplibre-gl'],
          motion: ['framer-motion'],
        },
      },
    },
  },
});
