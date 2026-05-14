import path from 'node:path'
import react from '@vitejs/plugin-react'
import { config as loadDotenv } from 'dotenv'
import { defineConfig } from 'vitest/config'

// Load .env.local so tests requiring DATABASE_URL (e.g. db integration test) Just Work.
// override: false → real environment wins over file; absent file is silently skipped.
loadDotenv({ path: '.env.local', override: false })

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}']
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './src/test/server-only-stub.ts')
    }
  }
})
