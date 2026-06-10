import 'server-only'
import { db } from '@/lib/db/client'
import { type NewOrder, type Order, orders } from '@/lib/db/schema'
import { and, desc, eq, sql } from 'drizzle-orm'

/**
 * Idempotent write of a completed order, keyed on `squareOrderId`. Replayed
 * webhook deliveries DO UPDATE the same row (never duplicate).
 */
export async function upsertOrder(order: NewOrder): Promise<void> {
  await db
    .insert(orders)
    .values(order)
    .onConflictDoUpdate({
      target: orders.squareOrderId,
      set: {
        squarePaymentId: order.squarePaymentId,
        userId: order.userId,
        buyerEmail: order.buyerEmail,
        squareCustomerId: order.squareCustomerId,
        status: order.status,
        totalCents: order.totalCents,
        currency: order.currency,
        lineItems: order.lineItems,
        placedAt: order.placedAt,
        raw: order.raw,
        updatedAt: new Date()
      }
    })
}

export async function getOrdersForUser(userId: string): Promise<Order[]> {
  return db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.placedAt))
}

export async function getOrderById(id: string): Promise<Order | undefined> {
  const rows = await db.select().from(orders).where(eq(orders.id, id)).limit(1)
  return rows[0]
}

/**
 * jsonb-containment predicate: a completed order for `userId` whose `lineItems`
 * contains an item with `catalogObjectId === productId`. Scoped to the user +
 * `status = 'completed'` so only real, paid purchases count. Postgres does the
 * containment check in-engine (`@>`) — no JS scan of every order.
 */
function purchasePredicate(userId: string, productId: string) {
  return and(
    eq(orders.userId, userId),
    eq(orders.status, 'completed'),
    sql`${orders.lineItems} @> ${JSON.stringify([{ catalogObjectId: productId }])}::jsonb`
  )
}

/**
 * True when the user has at least one completed order containing the product.
 * Powers the "Verified Purchase" badge / auto-publish decision.
 */
export async function hasPurchasedProduct(userId: string, productId: string): Promise<boolean> {
  const rows = await db
    .select({ squareOrderId: orders.squareOrderId })
    .from(orders)
    .where(purchasePredicate(userId, productId))
    .limit(1)
  return rows.length > 0
}

/**
 * The `squareOrderId` of the first completed order containing the product, or
 * null. Stamped on the review as `orderId` for audit; null ⇒ not verified.
 */
export async function findPurchaseOrderId(
  userId: string,
  productId: string
): Promise<string | null> {
  const rows = await db
    .select({ squareOrderId: orders.squareOrderId })
    .from(orders)
    .where(purchasePredicate(userId, productId))
    .limit(1)
  return rows[0]?.squareOrderId ?? null
}
