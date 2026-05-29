import 'server-only'
import { db } from '@/lib/db/client'
import { type AbandonedCart, abandonedCarts } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export interface CreatePendingCartInput {
  cartId: string
  squareOrderId: string
  cartSnapshot: unknown
  buyerEmail: string | null
}

export async function createPendingCart(input: CreatePendingCartInput): Promise<AbandonedCart> {
  const [row] = await db
    .insert(abandonedCarts)
    .values({
      cartId: input.cartId,
      squareOrderId: input.squareOrderId,
      cartSnapshot: input.cartSnapshot,
      buyerEmail: input.buyerEmail,
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
