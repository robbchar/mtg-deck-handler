import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Vite configuration for the MTG Deck Manager frontend.
 *
 * Proxy: all /api requests are forwarded to the Express backend on port 3001
 * so the Vite dev server and Express can run simultaneously without CORS issues.
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
        target: 'http://localhost:3001',
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