import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg', 'push-handler.js'],
      workbox: {
        importScripts: ['push-handler.js'],
        navigateFallbackDenylist: [/^\/functions\//],
        // Модель и WASM удаления фона большие — грузим по требованию и кешируем при первом использовании.
        globIgnores: ['**/*.wasm', '**/ort-*.mjs', '**/ort.*.js', '**/transformers*.js'],
        runtimeCaching: [
          { urlPattern: /\.(wasm|onnx)$|staticimgly\.com/, handler: 'CacheFirst', options: { cacheName: 'bg-removal', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 60 } } },
          { urlPattern: /^https:\/\/(api|geocoding-api|archive-api)\.open-meteo\.com\//, handler: 'NetworkFirst', options: { cacheName: 'weather', networkTimeoutSeconds: 6, expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 6 } } }
        ]
      },
      manifest: {
        name: 'MUSE — ИИ-стилист',
        short_name: 'MUSE',
        description: 'Гардероб, образы и планирование',
        theme_color: '#f7f5f0',
        background_color: '#f7f5f0',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      }
    })
  ]
})
