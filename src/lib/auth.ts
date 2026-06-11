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
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification }
  }),
  secret: env.BETTER_AUTH_SECRET,
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
