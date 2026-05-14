import type { Config } from 'drizzle-kit'

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://animeniacs:animeniacs@localhost:5432/animeniacs'
  },
  verbose: true,
  strict: true
} satisfies Config
