import { env } from '@/lib/env'

export function adminEmailSet(raw: string | undefined = env.ADMIN_EMAILS): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  )
}

export function isAdminAccount(
  u: { email: string; role?: string | null },
  adminEmails: Set<string> = adminEmailSet()
): boolean {
  return u.role === 'admin' || adminEmails.has(u.email.toLowerCase())
}

/** Server-side ban guard: returns an error message, or null when banning is allowed. */
export function banBlockReason(
  actorId: string | null,
  target: { id: string; email: string; role?: string | null },
  adminEmails: Set<string> = adminEmailSet()
): string | null {
  if (actorId && actorId === target.id) return 'You cannot ban yourself.'
  if (isAdminAccount(target, adminEmails)) return 'Admin accounts cannot be banned.'
  return null
}
