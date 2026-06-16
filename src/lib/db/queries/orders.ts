import 'server-only'
import { db } from '@/lib/db/client'
import { type NewOrder, type Order, orders } from '@/lib/db/schema'
import { type SQL, and, count, desc, eq, isNull, or, sql } from 'drizzle-orm'

/** Refund-aware order status (matches the `orders_status_valid` CHECK). */
export type OrderStatus = 'completed' | 'refunded' | 'partially_refunded'

/** Largest page the admin list will fetch in a single query. */
const MAX_LIST_LIMIT = 100

/** Filters shared by the admin list + count queries. */
export interface OrderFilter {
  /** Exact-match on the refund-aware status. */
  status?: OrderStatus
  /** Exact-match on the raw Square fulfillment state. */
  fulfillmentState?: string
  /** Case-insensitive substring match on squareOrderId OR buyerEmail. */
  q?: string
}

/**
 * Build the combined WHERE predicate for the admin order filters, or undefined
 * when no filter is active (so the caller can skip `.where()` entirely).
 * `q` matches squareOrderId OR buyerEmail, case-insensitive substring.
 */
function buildOrderFilter(filter: OrderFilter): SQL | undefined {
  const conditions: SQL[] = []
  if (filter.status) conditions.push(eq(orders.status, filter.status))
  if (filter.fulfillmentState) {
    conditions.push(eq(orders.fulfillmentState, filter.fulfillmentState))
  }
  const q = filter.q?.trim()
  if (q) {
    const pattern = `%${q.toLowerCase()}%`
    const search = or(
      sql`lower(${orders.squareOrderId}) like ${pattern}`,
      sql`lower(${orders.buyerEmail}) like ${pattern}`
    )
    if (search) conditions.push(search)
  }
  if (conditions.length === 0) return undefined
  return conditions.length === 1 ? conditions[0] : and(...conditions)
}

/**
 * Admin order list: newest first (`placedAt DESC NULLS LAST, createdAt DESC`),
 * paginated, with optional status / fulfillment / search filters. `limit` is
 * capped at {@link MAX_LIST_LIMIT}; a negative `offset` is floored at 0.
 */
export async function listOrders(
  opts: { limit: number; offset: number } & OrderFilter
): Promise<Order[]> {
  const limit = Math.min(Math.max(1, Math.floor(opts.limit)), MAX_LIST_LIMIT)
  const offset = Math.max(0, Math.floor(opts.offset))
  const where = buildOrderFilter(opts)

  const base = db.select().from(orders)
  const filtered = where ? base.where(where) : base
  return filtered
    .orderBy(sql`${orders.placedAt} desc nulls last`, desc(orders.createdAt))
    .limit(limit)
    .offset(offset)
}

/** Total matching rows for the same filters as {@link listOrders} (pagination). */
export async function countOrders(filter: OrderFilter): Promise<number> {
  const where = buildOrderFilter(filter)
  const base = db.select({ count: count() }).from(orders)
  const rows = await (where ? base.where(where) : base)
  return Number(rows[0]?.count ?? 0)
}

/** Read-only counters for the admin dashboard strip. All amounts in cents. */
export interface DashboardStats {
  ordersToday: number
  revenueTodayCents: number
  orders7d: number
  revenue7dCents: number
  orders30d: number
  revenue30dCents: number
  /** Cumulative refunded amount across all orders. */
  refundedTotalCents: number
  /** Completed orders whose fulfillment is null/PROPOSED/RESERVED/PREPARED. */
  needsFulfillment: number
}

/**
 * One-round-trip aggregate for the admin dashboard. Window boundaries are
 * computed relative to `now()` in SQL; counts/sums use FILTER aggregates so the
 * three rolling windows + refund total + needs-fulfillment count come back in a
 * single row. SUM-of-no-rows is NULL in postgres → coalesced to 0.
 */
export async function getOrderDashboardStats(): Promise<DashboardStats> {
  const needsFulfillment = sql`${orders.status} = 'completed' and (${orders.fulfillmentState} is null or ${orders.fulfillmentState} in ('PROPOSED', 'RESERVED', 'PREPARED'))`
  const rows = await db
    .select({
      ordersToday: sql<number>`count(*) filter (where ${orders.placedAt} >= now() - interval '1 day')`,
      revenueToday: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.placedAt} >= now() - interval '1 day'), 0)`,
      orders7d: sql<number>`count(*) filter (where ${orders.placedAt} >= now() - interval '7 days')`,
      revenue7d: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.placedAt} >= now() - interval '7 days'), 0)`,
      orders30d: sql<number>`count(*) filter (where ${orders.placedAt} >= now() - interval '30 days')`,
      revenue30d: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.placedAt} >= now() - interval '30 days'), 0)`,
      refundedTotal: sql<number>`coalesce(sum(${orders.refundedCents}), 0)`,
      needsFulfillment: sql<number>`count(*) filter (where ${needsFulfillment})`
    })
    .from(orders)

  const r = rows[0]
  return {
    ordersToday: Number(r?.ordersToday ?? 0),
    revenueTodayCents: Number(r?.revenueToday ?? 0),
    orders7d: Number(r?.orders7d ?? 0),
    revenue7dCents: Number(r?.revenue7d ?? 0),
    orders30d: Number(r?.orders30d ?? 0),
    revenue30dCents: Number(r?.revenue30d ?? 0),
    refundedTotalCents: Number(r?.refundedTotal ?? 0),
    needsFulfillment: Number(r?.needsFulfillment ?? 0)
  }
}

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

/**
 * Guest-order claiming (Phase 15): attach orders placed as a guest to a newly
 * signed-in account by verified email. Only touches rows with `userId IS NULL`
 * matched on a case-insensitive `buyerEmail` — never reassigns an already-owned
 * order. Idempotent (a second run finds nothing left to claim). Returns the
 * number of orders claimed.
 */
export async function claimGuestOrders(userId: string, email: string): Promise<number> {
  const claimed = await db
    .update(orders)
    .set({ userId, updatedAt: new Date() })
    .where(and(isNull(orders.userId), sql`lower(${orders.buyerEmail}) = ${email.toLowerCase()}`))
    .returning({ id: orders.id })
  return claimed.length
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
