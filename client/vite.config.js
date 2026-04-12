import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Vite configuration for the MTG Deck Manager frontend.
 *
 * Proxy: all /api requests are forwarded to the Firebase Functions emulator
 * so the Vite dev server and emulator can run simultaneously without CORS issues.
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
        target: 'http://localhost:5001/robbchar-3db11/us-central1/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
})