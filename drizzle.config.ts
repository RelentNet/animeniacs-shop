import type { Config } from 'drizzle-kit'

// Drizzle Kit runs as a standalone CLI — it does NOT go through the Next.js
// bundler, so it can't import `@/lib/env` (which is server-only-guarded and
// expects a live process.env).
//
// We keep a local-dev fallback URL so two ergonomics work out of the box:
//   1. `pnpm db:generate` without a sourced .env.local (CI-friendly, fast path).
//   2. New devs running `pnpm db:push` for the first time with default credentials.
//
// Trade-off: a misconfigured production deploy with no DATABASE_URL would
// silently target the local-dev URL. Acceptable because production runs
// `pnpm db:migrate` inside a container where the env is always explicitly set,
// and the resulting connection would fail loudly on the wrong host.
const DEFAULT_LOCAL_DB_URL = 'postgres://animeniacs:animeniacs@localhost:5432/animeniacs'

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // Use `||` (not `??`) so an explicitly-empty DATABASE_URL falls back to the default.
    url: process.env.DATABASE_URL || DEFAULT_LOCAL_DB_URL
  },
  verbose: true,
  strict: true
} satisfies Config
