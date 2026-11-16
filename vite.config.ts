import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // L'app est servie sous https://lepetitperchoir.fr/bataille2bato/ par le routeur.
  base: '/bataille2bato/',
  // Ports déjà pris : 5174 courses, 5175 mrwhite, 5176 olemains, 5177 calendrier.
  server: { port: 5178 },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev'),
  },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'prompt',
      // Pas de manifeste propre : c'est le portail qui est installable.
      manifest: false,
      workbox: {
        navigateFallback: '/bataille2bato/index.html',
        navigateFallbackAllowlist: [/^\/bataille2bato\/(index\.html)?$/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
