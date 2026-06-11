import 'server-only'
import { db } from '@/lib/db/client'
import { user } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

/**
 * True when at least one user has the `admin` role. The (admin) gate uses this
 * to distinguish "you're not an admin" (403) from "nobody is an admin yet" — the
 * latter renders a provisioning hint so the operator isn't hard-locked out after
 * the Logto→better-auth migration (run `pnpm auth:grant-admin <email>`).
 */
export async function hasAnyAdmin(): Promise<boolean> {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, 'admin'))
    .limit(1)
  return rows.length > 0
}

/**
 * Reads the Square customer id cached on a user row (Phase 15; replaces the
 * dropped `customer_link` table). Returns null when the user is unknown or has
 * no Square mapping yet.
 */
export async function getUserSquareCustomerId(userId: string): Promise<string | null> {
  const rows = await db
    .select({ squareCustomerId: user.squareCustomerId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  return rows[0]?.squareCustomerId ?? null
}

/**
 * Persists the Square customer id onto the user row. Idempotent — a repeat
 * checkout just rewrites the same mapping.
 */
export async function setUserSquareCustomerId(
  userId: string,
  squareCustomerId: string
): Promise<void> {
  await db
    .update(user)
    .set({ squareCustomerId, updatedAt: new Date() })
    .where(eq(user.id, userId))
}
