import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
  // Relative base works on GitHub Pages regardless of the repository name (hash router).
  base: './',
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      // prompt instead of auto-reloading so an update never interrupts entering a record
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '記帳本',
        short_name: '記帳本',
        description: '離線優先、可同步到 Google 試算表的記帳 App',
        lang: 'zh-Hant',
        theme_color: '#fafafa',
        background_color: '#fafafa',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // reminder notifications sent by the Worker (see public/push-sw.js)
        importScripts: ['push-sw.js'],
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // listen on the LAN so a phone on the same Wi-Fi can open the dev server
  server: { host: true },
})
