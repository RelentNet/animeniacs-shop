import path from 'node:path'
import { config as loadDotenv } from 'dotenv'
import { defineConfig } from 'vitest/config'

loadDotenv({ path: '.env.local', override: false })

export default defineConfig({
  test: {
    // Integration tests use the Node env (no jsdom); they run real DB queries.
    environment: 'node',
    setupFiles: [],
    globals: true,
    include: ['tests/integration/**/*.integration.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
    // Integration tests share the same Postgres; force serial to avoid surprises.
    // Each test file uses a unique namespace prefix, so parallelism would be safe
    // in principle — but serial is simpler to debug and the volume is small.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    // Generous timeout for cold-start connection pool.
    testTimeout: 30_000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './src/test/server-only-stub.ts')
    }
  }
})
