import type { Config } from 'drizzle-kit'

// Drizzle Kit cannot import from @/lib/env because it doesn't run through the
// Next.js bundler. We duplicate the local-dev default here so `pnpm db:generate`
// works without a live env, but PROD must always provide DATABASE_URL explicitly.
const DEFAULT_LOCAL_DB_URL = 'postgres://animeniacs:animeniacs@localhost:5432/animeniacs'

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? DEFAULT_LOCAL_DB_URL
  },
  verbose: true,
  strict: true
} satisfies Config
