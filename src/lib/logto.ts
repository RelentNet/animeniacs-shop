import 'server-only'
import { env } from '@/lib/env'
import type { LogtoNextConfig } from '@logto/next'

/**
 * Logto Next.js SDK configuration, surfaced as the single source of
 * truth for every admin-gated route. Built lazily from env so that
 * test runs that mock `getLogtoContext` don't fall over when the env
 * vars aren't set.
 *
 * Required env vars (set when you run the manual Logto bootstrap —
 * see `docs/operations/logto-setup.md`):
 *   - LOGTO_ENDPOINT          e.g. http://localhost:3004
 *   - LOGTO_APP_ID
 *   - LOGTO_APP_SECRET
 *   - LOGTO_COOKIE_SECRET     ≥32 chars, used to encrypt the session
 *   - NEXT_PUBLIC_SITE_URL    base URL of this Next.js app (used as
 *                              `baseUrl` for redirect bookkeeping)
 *
 * When any of the four Logto fields above is missing,
 * `logtoConfig.appId/appSecret/cookieSecret` will be empty strings.
 * The admin-layout gate guards on that at request time and falls
 * back to a clear runtime error rather than letting Logto crash with
 * a less-helpful message.
 */
export const logtoConfig: LogtoNextConfig = {
  endpoint: env.LOGTO_ENDPOINT,
  appId: env.LOGTO_APP_ID ?? '',
  appSecret: env.LOGTO_APP_SECRET ?? '',
  baseUrl: env.LOGTO_BASE_URL ?? env.NEXT_PUBLIC_SITE_URL,
  cookieSecret: env.LOGTO_COOKIE_SECRET ?? '',
  cookieSecure: process.env.NODE_ENV === 'production',
  // Roles are surfaced as a claim on the ID token; the (admin) layout
  // gate reads `claims?.roles` to authorize.
  scopes: ['openid', 'profile', 'email', 'roles']
}

/**
 * True when every Logto config field needed for a real sign-in flow
 * is present. Used by the admin gate to render a clear setup-required
 * message instead of crashing into Logto's SDK with empty strings.
 */
export function isLogtoConfigured(): boolean {
  return Boolean(env.LOGTO_APP_ID && env.LOGTO_APP_SECRET && env.LOGTO_COOKIE_SECRET)
}
