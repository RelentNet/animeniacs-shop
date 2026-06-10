import 'server-only'
import { db } from '@/lib/db/client'
import { type NewOrder, type Order, orders } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'

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
