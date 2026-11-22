import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative asset URLs so dist/ works from any static path (e.g. a GitHub Pages subpath).
  base: './',
  plugins: [
    react(),
    VitePWA({
      // The app prompts for updates itself (src/pwa/register.ts); no auto-injected script.
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        id: './',
        name: 'Murdoku',
        short_name: 'Murdoku',
        description:
          'A murder-mystery logic puzzle. Place the victim and eight suspects on a 9x9 floor plan using clues, then name the murderer.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f6f3ee',
        theme_color: '#f6f3ee',
        categories: ['games', 'puzzle'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Includes the module worker chunk (src/worker/client.ts) so puzzles generate offline.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // ?seed=...&d=... share links open offline.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    alias: { 'virtual:pwa-register': fileURLToPath(new URL('./tests/pwa/registerStub.ts', import.meta.url)) },
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    // Engine tests generate and solve many puzzles; under a parallel full run
    // they can exceed Vitest's 5 s default, so allow more headroom.
    testTimeout: 30000,
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    coverage: { provider: 'v8', include: ['src/**'] },
  },
});
