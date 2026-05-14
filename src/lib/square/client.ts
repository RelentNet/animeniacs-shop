import 'server-only'
import { env } from '@/lib/env'
import { SquareClient, SquareEnvironment } from 'square'

/**
 * Module-level singleton so we don't churn TCP connections in dev hot-reloads.
 * The pattern mirrors src/lib/db/client.ts: cache lives in module scope, and
 * we only publish to globalThis in non-production so the instance survives
 * Next.js dev HMR. Production gets a fresh client per process.
 */
const globalForSquare = globalThis as unknown as { __squareClient?: SquareClient }

let cachedClient: SquareClient | undefined = globalForSquare.__squareClient

function buildClient(): SquareClient {
  if (!env.SQUARE_ACCESS_TOKEN) {
    throw new Error('SQUARE_ACCESS_TOKEN is not set. Add it to .env.local before calling Square.')
  }
  return new SquareClient({
    token: env.SQUARE_ACCESS_TOKEN,
    environment:
      env.SQUARE_ENV === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox
  })
}

export function getSquareClient(): SquareClient {
  if (!cachedClient) {
    cachedClient = buildClient()
    if (process.env.NODE_ENV !== 'production') {
      globalForSquare.__squareClient = cachedClient
    }
  }
  return cachedClient
}

/**
 * Resets the cached client. Test-only; safe to leave in the bundle because
 * it's a tiny function with no side effects until called.
 */
export function __resetSquareClientForTests(): void {
  cachedClient = undefined
  globalForSquare.__squareClient = undefined
}
