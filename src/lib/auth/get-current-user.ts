import 'server-only'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

/**
 * Normalized view of the current better-auth session, used by the account/admin
 * gates, the checkout route, and the account pages. Wrapping
 * `auth.api.getSession` here gives callers a single null-safe shape regardless
 * of whether a session exists.
 *
 * Phase 15: the internals swapped from the previous OIDC provider to better-auth,
 * but the `CurrentUser` interface is kept BYTE-IDENTICAL so the ~13 consumers
 * are untouched — `userId` is now the better-auth `user.id` (was the OIDC
 * subject) and `roles` is derived from the `role` column on the user row.
 */
export interface CurrentUser {
  isAuthenticated: boolean
  /** better-auth `user.id` — the stable per-user id; null when unauthenticated. */
  userId: string | null
  email: string | null
  name: string | null
  roles: string[]
}

const ANONYMOUS: CurrentUser = {
  isAuthenticated: false,
  userId: null,
  email: null,
  name: null,
  roles: []
}

export async function getCurrentUser(): Promise<CurrentUser> {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return ANONYMOUS
    }
    const u = session.user
    return {
      isAuthenticated: true,
      userId: u.id,
      email: u.email ?? null,
      name: u.name ?? null,
      // `role` is the user-row column (better-auth additionalField). Collapse it
      // to the roles array the (admin) gate already checks via includes('admin').
      roles: u.role === 'admin' ? ['admin'] : []
    }
  } catch {
    // No session / auth subsystem error — treat as anonymous rather than throwing.
    return ANONYMOUS
  }
}
