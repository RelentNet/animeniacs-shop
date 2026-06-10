import 'server-only'
import { logtoConfig } from '@/lib/logto'
import { getLogtoContext } from '@logto/next/server-actions'

/**
 * Normalized view of the current Logto session, used by the account gate,
 * the checkout route, and the account pages. Wrapping `getLogtoContext` here
 * kills the repeated try/catch boilerplate and gives callers a single,
 * null-safe shape regardless of whether a session exists.
 */
export interface CurrentUser {
  isAuthenticated: boolean
  /** Logto `sub` — the stable per-user id; null when unauthenticated. */
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
    const { isAuthenticated, claims } = await getLogtoContext(logtoConfig)
    if (!isAuthenticated || !claims) {
      return ANONYMOUS
    }
    return {
      isAuthenticated: true,
      userId: claims.sub ?? null,
      email: claims.email ?? null,
      name: claims.name ?? null,
      roles: claims.roles ?? []
    }
  } catch {
    // No session / Logto unreachable — treat as anonymous rather than throwing.
    return ANONYMOUS
  }
}
