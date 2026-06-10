import 'server-only'
import { db } from '@/lib/db/client'
import { type NewOrder, type Order, orders } from '@/lib/db/schema'
import { and, desc, eq, sql } from 'drizzle-orm'

/** Refund-aware order status (matches the `orders_status_valid` CHECK). */
export type OrderStatus = 'completed' | 'refunded' | 'partially_refunded'

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
        fulfillmentState: order.fulfillmentState,
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

/** Look up an order by its Square order ID (the idempotency key). */
export async function getOrderBySquareOrderId(squareOrderId: string): Promise<Order | undefined> {
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.squareOrderId, squareOrderId))
    .limit(1)
  return rows[0]
}

/**
 * Guest-lookup read path: matches BOTH the exact `squareOrderId` AND the
 * `buyerEmail` (case-insensitive via `lower()`). The order number is the shared
 * secret; the email gates disclosure. Returns undefined on any mismatch — the
 * caller must surface a generic error without revealing which field was wrong.
 */
export async function getOrderBySquareOrderIdAndEmail(
  squareOrderId: string,
  email: string
): Promise<Order | undefined> {
  const rows = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.squareOrderId, squareOrderId),
        sql`lower(${orders.buyerEmail}) = ${email.toLowerCase()}`
      )
    )
    .limit(1)
  return rows[0]
}

/**
 * Reflect a refund: set the refund-aware `status` + cumulative `refundedCents`,
 * keyed on `squareOrderId`. Both values are server-computed from the
 * authoritative Square order, never from raw webhook payload amounts.
 */
export async function updateOrderStatus(
  squareOrderId: string,
  status: OrderStatus,
  refundedCents: number
): Promise<void> {
  await db
    .update(orders)
    .set({ status, refundedCents, updatedAt: new Date() })
    .where(eq(orders.squareOrderId, squareOrderId))
}

/** Record the latest fulfillment state, keyed on `squareOrderId`. */
export async function setOrderFulfillmentState(
  squareOrderId: string,
  fulfillmentState: string | null
): Promise<void> {
  await db
    .update(orders)
    .set({ fulfillmentState, updatedAt: new Date() })
    .where(eq(orders.squareOrderId, squareOrderId))
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
