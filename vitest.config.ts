import path from 'node:path'
import react from '@vitejs/plugin-react'
import { config as loadDotenv } from 'dotenv'
import { defineConfig } from 'vitest/config'

// Load .env.local so any test that genuinely needs DATABASE_URL Just Works.
// override: false → real environment wins over file; absent file is silently skipped.
loadDotenv({ path: '.env.local', override: false })

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    // Unit tests only by default. Integration tests run via `pnpm test:integration`.
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    exclude: ['tests/integration/**', 'node_modules/**', '.next/**'],
    // The default 5s timeout flakes on busy machines because vitest's
    // first-test environment cold-start can take 4+ s by itself. Bump
    // to 15s so we're not chasing phantom failures.
    testTimeout: 15_000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './src/test/server-only-stub.ts')
    }
  }
})
