import 'server-only'
import { env } from '@/lib/env'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

type PgClient = ReturnType<typeof postgres>

// Reuse a single connection pool across Next.js dev hot-reloads.
// In production, NODE_ENV is 'production' and we don't attach to globalThis,
// so each process gets a fresh pool.
const globalForDb = globalThis as unknown as { __pgClient?: PgClient }

const queryClient: PgClient =
  globalForDb.__pgClient ??
  postgres(env.DATABASE_URL, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10
  })

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__pgClient = queryClient
}

export const db = drizzle(queryClient, { schema })
export type DB = typeof db
