import 'server-only'
import { db } from '@/lib/db/client'
import { type OrderLogEntry, orderLog } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export interface AppendOrderLogInput {
  squareOrderId: string
  eventType: string
  /** Nullable for non-webhook writes; webhook writes ALWAYS set this. */
  eventId: string | null
  payload: unknown
}

export async function appendOrderLog(input: AppendOrderLogInput): Promise<OrderLogEntry> {
  const [row] = await db.insert(orderLog).values(input).returning()
  return row
}

/**
 * Webhook idempotency check. Returns true if we've already recorded
 * this Square event_id, false otherwise. Always returns false for the
 * empty string (defensive; an empty id should never match a recorded id).
 */
export async function hasEventId(eventId: string): Promise<boolean> {
  if (!eventId) return false
  const rows = await db
    .select({ id: orderLog.id })
    .from(orderLog)
    .where(eq(orderLog.eventId, eventId))
    .limit(1)
  return rows.length > 0
}
