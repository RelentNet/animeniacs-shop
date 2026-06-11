import 'server-only'
import { db } from '@/lib/db/client'
import { user } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

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
