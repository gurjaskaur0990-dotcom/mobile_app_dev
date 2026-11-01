import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,webmanifest,ico,png,webp}'],
      },

      registerType: 'prompt',
      manifest: {
        id: '/',
        name: 'SplitTrip',
        short_name: 'SplitTrip',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#f4f4f5',
        background_color: '#f4f4f5',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          ionic: ['@ionic/react', '@ionic/react-router'],
        },
      },
    },
  },
})
