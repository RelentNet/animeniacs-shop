import 'server-only'
import { db } from '@/lib/db/client'
import { type AbandonedCart, abandonedCarts } from '@/lib/db/schema'
import { and, eq, isNotNull, isNull, lt, ne, sql } from 'drizzle-orm'

export interface CreatePendingCartInput {
  cartId: string
  squareOrderId: string
  cartSnapshot: unknown
  buyerEmail: string | null
  /** better-auth user id of the buyer (Phase 11 attribution bridge). Null for guests. */
  buyerUserId?: string | null
  /** Square customer attributed at checkout (Phase 11). Null for guests. */
  squareCustomerId?: string | null
}

export async function createPendingCart(input: CreatePendingCartInput): Promise<AbandonedCart> {
  const [row] = await db
    .insert(abandonedCarts)
    .values({
      cartId: input.cartId,
      squareOrderId: input.squareOrderId,
      cartSnapshot: input.cartSnapshot,
      buyerEmail: input.buyerEmail,
      buyerUserId: input.buyerUserId ?? null,
      squareCustomerId: input.squareCustomerId ?? null,
      status: 'pending'
    })
    .returning()
  return row
}

export async function getCartBySquareOrderId(
  squareOrderId: string
): Promise<AbandonedCart | undefined> {
  const rows = await db
    .select()
    .from(abandonedCarts)
    .where(eq(abandonedCarts.squareOrderId, squareOrderId))
    .limit(1)
  return rows[0]
}

export async function markCartCompleted(squareOrderId: string): Promise<void> {
  await db
    .update(abandonedCarts)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(eq(abandonedCarts.squareOrderId, squareOrderId))
}

export async function markCartAbandoned(squareOrderId: string): Promise<void> {
  await db
    .update(abandonedCarts)
    .set({ status: 'abandoned', updatedAt: new Date() })
    .where(eq(abandonedCarts.squareOrderId, squareOrderId))
}

export interface CartForReminder {
  cartId: string
  buyerEmail: string
  cartSnapshot: unknown
}

/**
 * Returns pending carts eligible for an abandonment reminder:
 *   - status not 'completed' and not 'abandoned' (still pending/in_checkout)
 *   - buyer_email IS NOT NULL (logged-in checkout only)
 *   - created_at < NOW() - thresholdMinutes
 *   - reminder_sent_at IS NULL (not already sent)
 */
export async function getCartsForReminder(thresholdMinutes: number): Promise<CartForReminder[]> {
  const rows = await db
    .select({
      cartId: abandonedCarts.cartId,
      buyerEmail: abandonedCarts.buyerEmail,
      cartSnapshot: abandonedCarts.cartSnapshot
    })
    .from(abandonedCarts)
    .where(
      and(
        ne(abandonedCarts.status, 'completed'),
        ne(abandonedCarts.status, 'abandoned'),
        isNotNull(abandonedCarts.buyerEmail),
        isNull(abandonedCarts.reminderSentAt),
        lt(abandonedCarts.createdAt, sql`NOW() - (${thresholdMinutes} * INTERVAL '1 minute')`)
      )
    )
  // buyerEmail is guaranteed non-null by the isNotNull filter above
  return rows.map((r) => ({
    cartId: r.cartId,
    buyerEmail: r.buyerEmail as string,
    cartSnapshot: r.cartSnapshot
  }))
}

/**
 * Stamps reminder_sent_at = NOW() and sets status = 'abandoned'
 * for a cart that has been sent a recovery email.
 */
export async function markReminderSent(cartId: string): Promise<void> {
  await db
    .update(abandonedCarts)
    .set({ status: 'abandoned', reminderSentAt: new Date(), updatedAt: new Date() })
    .where(eq(abandonedCarts.cartId, cartId))
}
