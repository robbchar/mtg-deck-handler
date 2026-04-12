import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Vite configuration for the MTG Deck Manager frontend.
 *
 * Proxy: /api requests go to the Firebase Functions emulator (port 5001) with a
 * path rewrite that prepends the project/region/function prefix. The Functions
 * emulator strips that prefix before passing the request to Express, so Express
 * still receives the full /api/decks path — matching production behaviour.
 *
 * Example: GET /api/decks
 *   → rewritten to /robbchar-3db11/us-central1/mtgApi/api/decks (sent to port 5001)
 *   → Functions emulator strips /robbchar-3db11/us-central1/mtgApi
 *   → Express sees GET /api/decks ✓
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
        target: 'http://localhost:5001',
        changeOrigin: true,
        rewrite: (path) =>
          path.replace(/^\/api/, '/robbchar-3db11/us-central1/mtgApi/api'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
})