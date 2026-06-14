import { getCurrentUser } from '@/lib/auth/get-current-user'
import { hasAnyAdmin } from '@/lib/db/queries/user'
import { redirect } from 'next/navigation'

// Admin routes always read auth cookies + DB at request time. Forcing
// dynamic stops Next.js from attempting build-time prerender, which
// would try to resolve the Postgres hostname and call Square in an
// environment that has neither. Phase 7.5/B.6 fix.
export const dynamic = 'force-dynamic'

/**
 * Auth gate for every page under the (admin) route group (Phase 15: better-auth).
 * Behaviour:
 *   - Unauthenticated → redirect to /sign-in.
 *   - Authenticated without the `admin` role:
 *       · if NO admin exists yet → render a provisioning hint (so the operator
 *         who just signed up isn't hard-locked — run `pnpm auth:grant-admin`).
 *       · otherwise → render a 403 message.
 *   - Admin → render children inside the admin shell.
 */
export default async function AdminLayout({
  children
}: {
  children: React.ReactNode
}): Promise<JSX.Element> {
  const { isAuthenticated, roles } = await getCurrentUser()

  if (!isAuthenticated) {
    redirect('/sign-in')
  }

  if (!roles.includes('admin')) {
    // No admin provisioned yet → guide the operator instead of a hard lock.
    if (!(await hasAnyAdmin())) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
          <h1>Admin area — no admin provisioned yet</h1>
          <p>
            No account has the <code>admin</code> role. Sign up with your admin email, then grant it
            from a terminal:
          </p>
          <pre>
            <code>pnpm auth:grant-admin &lt;your-email&gt;</code>
          </pre>
          <p>Reload this page after granting the role.</p>
        </div>
      )
    }
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
      className="admin-shell"
      style={{
        colorScheme: 'light',
        color: '#111',
        background: '#fff',
        minHeight: '100vh'
      }}
    >
      {/*
       * Admin form controls otherwise rely on near-invisible browser default
       * borders. Scope a clear black border to every input/select/textarea/
       * button under the admin shell so operators can actually see the fields.
       * Plain CSS (not Tailwind), consistent with the inline-styled admin idiom;
       * applies to all admin forms at once, current and future.
       */}
      <style>{`
        .admin-shell input:not([type='checkbox']):not([type='radio']),
        .admin-shell select,
        .admin-shell textarea,
        .admin-shell button {
          border: 1px solid #111;
          border-radius: 0.25rem;
          background: #fff;
          color: #111;
        }
        .admin-shell input:not([type='checkbox']):not([type='radio']),
        .admin-shell select,
        .admin-shell textarea {
          padding: 0.4rem 0.5rem;
        }
        .admin-shell button {
          cursor: pointer;
        }
        .admin-shell input:focus-visible,
        .admin-shell select:focus-visible,
        .admin-shell textarea:focus-visible,
        .admin-shell button:focus-visible {
          outline: 2px solid #111;
          outline-offset: 1px;
        }
      `}</style>
      {/*
       * Slim admin header (Phase 16, spec §6): every page under (admin) gets an
       * obvious way back to the dashboard. Operator request — there was no easy
       * route home from admin sub-pages. Kept boring on purpose; the admin
       * tooling dashboard is a later phase.
       */}
      <header
        style={{
          borderBottom: '1px solid #ddd',
          padding: '0.75rem 1.5rem',
          background: '#fafafa'
        }}
      >
        <nav aria-label="Admin">
          <a href="/admin" style={{ color: '#111', fontWeight: 600, textDecoration: 'none' }}>
            ← Admin home
          </a>
        </nav>
      </header>
      {children}
    </div>
  )
}
