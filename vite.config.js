import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', '*.svg'],
      manifest: {
        id: '/?app=edgex-life',
        name: 'EdgeX Life — Goals, Health, Wellness',
        short_name: 'EdgeX Life',
        description: 'Vision, goals, health and wellness for The EDGEx',
        theme_color: '#f7f8f6',
        background_color: '#f7f8f6',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: '/index.html',
        // Vision-board images are fetched one-by-one through an RPC and then
        // cached by the app itself (see src/lib/imageCache.js). Nothing from
        // supabase.co is ever cached by Workbox.
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
})
