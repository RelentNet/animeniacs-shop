import { isLogtoConfigured, logtoConfig } from '@/lib/logto'
import { getLogtoContext } from '@logto/next/server-actions'
import { redirect } from 'next/navigation'

// Admin routes always read auth cookies + DB at request time. Forcing
// dynamic stops Next.js from attempting build-time prerender, which
// would try to resolve the Postgres hostname and call Square in an
// environment that has neither. Phase 7.5/B.6 fix.
export const dynamic = 'force-dynamic'

/**
 * Auth gate for every page under the (admin) route group.
 *
 * Behaviour (matches the plan's Task B.1 spec and design spec §10/§11):
 *   - If Logto is not yet configured locally → render a setup-required
 *     screen pointing at docs/operations/logto-setup.md instead of
 *     crashing into the SDK with empty credentials.
 *   - If the request is unauthenticated → redirect to /sign-in.
 *   - If the request is authenticated but lacks the `admin` role on
 *     the ID token → render a 403 message.
 *   - Otherwise → render children inside a bare wrapper (no chrome /
 *     styling here; Phase 7 owns the admin shell).
 */
export default async function AdminLayout({
  children
}: {
  children: React.ReactNode
}): Promise<JSX.Element> {
  if (!isLogtoConfigured()) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
        <h1>Admin area — Logto not yet configured</h1>
        <p>
          This route group is gated by Logto. The local Logto instance hasn’t been bootstrapped yet,
          so there’s no way to sign in. See <code>docs/operations/logto-setup.md</code> for the
          manual steps.
        </p>
      </div>
    )
  }

  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig)

  if (!isAuthenticated) {
    redirect('/sign-in')
  }

  const roles = claims?.roles ?? []
  if (!roles.includes('admin')) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
        <h1>403 — Admin role required</h1>
        <p>
          You’re signed in, but your account does not have the <code>admin</code> role.
        </p>
      </div>
    )
  }

  return (
    <div
      style={{
        colorScheme: 'light',
        color: '#111',
        background: '#fff',
        minHeight: '100vh'
      }}
    >
      {children}
    </div>
  )
}
