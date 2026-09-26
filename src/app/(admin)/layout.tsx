import { Logo } from '@/components/layout/Logo'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { hasAnyAdmin } from '@/lib/db/queries/user'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AdminNav } from './admin/_components/AdminNav'

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
 *   - Admin → render children inside the themed admin shell.
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
        <div className="mx-auto max-w-2xl px-4 py-16">
          <p className="eyebrow">Admin</p>
          <h1 className="mt-2 font-display text-3xl tracking-wide text-bone">
            No admin provisioned yet
          </h1>
          <p className="mt-4 text-muted">
            No account has the <code className="font-mono text-purple-soft">admin</code> role. Sign
            up with your admin email, then grant it from a terminal:
          </p>
          <pre className="panel mt-4 overflow-x-auto p-4 font-mono text-sm text-bone">
            <code>pnpm auth:grant-admin &lt;your-email&gt;</code>
          </pre>
          <p className="mt-4 text-muted">Reload this page after granting the role.</p>
        </div>
      )
    }
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <p className="eyebrow">Admin</p>
        <h1 className="mt-2 font-display text-3xl tracking-wide text-bone">
          403 — Admin role required
        </h1>
        <p className="mt-4 text-muted">
          You’re signed in, but your account does not have the{' '}
          <code className="font-mono text-purple-soft">admin</code> role.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/*
       * Slim admin header (Phase 16, spec §6): every page under (admin) gets an
       * obvious way back to the dashboard. Themed to match the storefront
       * Header — site Logo + nav — plus the AdminNav tab bar below it.
       */}
      <header className="sticky top-0 z-40 border-b border-line bg-ink/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-3">
          <Link href="/admin" aria-label="Admin home" className="block hover:no-underline">
            <Logo className="h-10 w-auto" />
          </Link>
          <Link href="/" className="link-neon text-sm">
            Back to storefront
          </Link>
        </div>
        <AdminNav />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10">{children}</main>
    </div>
  )
}
