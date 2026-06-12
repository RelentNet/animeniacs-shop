import 'server-only'
import { db } from '@/lib/db/client'
import { account, session, user, verification } from '@/lib/db/schema'
import { env } from '@/lib/env'
import { sendPasswordResetEmail } from '@/lib/notifications/email'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'

/**
 * better-auth (Phase 15) — email + password, sessions + users in our own
 * Postgres. Replaces the external OIDC service. better-auth owns password
 * hashing + session cookies; `getCurrentUser()` reads `auth.api.getSession`.
 *
 * Decisions (spec §3):
 *   - Email verification is OFF this phase so signup isn't blocked on email
 *     infra; password reset still flows through Resend (no-ops if unconfigured).
 *   - `squareCustomerId` + `role` live on the user row (additionalFields),
 *     `input:false` so clients can't set them — only the server / grant-admin.
 *   - `nextCookies()` MUST be the last plugin (sets cookies on server actions).
 */
/**
 * BETTER_AUTH_SECRET is optional in the env schema (so the build doesn't depend
 * on a runtime-only secret) but REQUIRED at runtime. Enforce it here — except
 * during `next build`, where page-data collection imports this module without
 * ever serving a request. NEXT_PHASE is 'phase-production-build' only at build.
 */
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build'
if (!env.BETTER_AUTH_SECRET && !isBuildPhase) {
  throw new Error(
    'BETTER_AUTH_SECRET is required at runtime. Set it in the app environment (openssl rand -hex 32).'
  )
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification }
  }),
  // Real secret at runtime; a placeholder only during the build phase (never
  // used to sign anything, since the build serves no requests).
  secret: env.BETTER_AUTH_SECRET ?? 'build-phase-placeholder-unused-at-runtime',
  baseURL: env.BETTER_AUTH_URL ?? env.NEXT_PUBLIC_SITE_URL,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    sendResetPassword: async ({ user: u, url }) => {
      await sendPasswordResetEmail({ to: u.email, resetUrl: url })
    }
  },
  user: {
    additionalFields: {
      squareCustomerId: { type: 'string', required: false, input: false },
      role: { type: 'string', required: false, input: false, defaultValue: 'user' }
    }
  },
  plugins: [nextCookies()]
})
