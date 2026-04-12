import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Vite configuration for the MTG Deck Manager frontend.
 *
 * Proxy: /api requests go to the Firebase Hosting emulator (port 5000), NOT the
 * Functions emulator directly. This matters because the Functions emulator strips
 * the function path prefix — Express would receive /decks instead of /api/decks.
 * The Hosting emulator applies firebase.json rewrites and forwards the full
 * /api/decks path to the function, matching how production Hosting works.
 *
 * Test: jsdom environment with @testing-library/jest-dom matchers auto-imported
 * via a setup file.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
})