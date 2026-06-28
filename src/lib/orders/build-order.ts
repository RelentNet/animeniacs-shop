import type { NewOrder, OrderShipping } from '@/lib/db/schema'
import { toJsonSafe } from '@/lib/orders/json-safe'

export { toJsonSafe }

/** One denormalized line item stored in `orders.lineItems` (jsonb). */
export interface OrderLineItem {
  name: string
  quantity: number
  unitPriceCents: number
  totalCents: number
  catalogObjectId?: string
  variationName?: string
}

/** Identity fields read from the `abandoned_carts` attribution bridge. */
export interface OrderBridge {
  userId: string | null
  buyerEmail: string | null
  squareCustomerId: string | null
  squarePaymentId: string | null
  /** Captured ship-to + chosen Shippo rate (from the pending cart). Optional. */
  shipping?: OrderShipping | null
}

function toCents(amount: unknown): number {
  if (typeof amount === 'bigint') return Number(amount)
  if (typeof amount === 'number') return amount
  return 0
}

function toDate(value: unknown): Date | null {
  if (typeof value === 'string' && value.length > 0) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

// Progression rank for Square fulfillment states. Higher = further along the
// happy path. CANCELED/FAILED are terminal off-path states ranked below the
// active progression so a real COMPLETED/PREPARED wins when both are present.
const FULFILLMENT_RANK: Record<string, number> = {
  FAILED: -2,
  CANCELED: -1,
  PROPOSED: 0,
  RESERVED: 1,
  PREPARED: 2,
  COMPLETED: 3
}

/**
 * The most-advanced fulfillment state across all fulfillments, or null when
 * there are none. Multi-fulfillment orders surface the furthest-progressed
 * state so the customer sees the best signal available.
 */
export function mostAdvancedFulfillmentState(
  // biome-ignore lint/suspicious/noExplicitAny: Square fulfillment shape is loose
  fulfillments: any
): string | null {
  if (!Array.isArray(fulfillments) || fulfillments.length === 0) return null
  let best: string | null = null
  let bestRank = Number.NEGATIVE_INFINITY
  for (const f of fulfillments) {
    const state = typeof f?.state === 'string' ? f.state : null
    if (!state) continue
    const rank = FULFILLMENT_RANK[state] ?? -3
    if (rank > bestRank) {
      bestRank = rank
      best = state
    }
  }
  return best
}

/**
 * Pure mapper (no I/O): the authoritative Square Order + the attribution
 * bridge → a `NewOrder` row for the `orders` read model. Money fields come
 * back from Square as `bigint`; convert to integer cents.
 */
export function buildOrder(
  // biome-ignore lint/suspicious/noExplicitAny: Square Order shape is loose
  squareOrder: any,
  bridge: OrderBridge
): NewOrder {
  // biome-ignore lint/suspicious/noExplicitAny: Square line item shape is loose
  const rawItems: any[] = Array.isArray(squareOrder?.lineItems) ? squareOrder.lineItems : []
  const lineItems: OrderLineItem[] = rawItems.map((li) => {
    const item: OrderLineItem = {
      name: typeof li?.name === 'string' ? li.name : '',
      quantity: Number.parseInt(li?.quantity ?? '0', 10) || 0,
      unitPriceCents: toCents(li?.basePriceMoney?.amount),
      totalCents: toCents(li?.totalMoney?.amount)
    }
    if (li?.catalogObjectId) item.catalogObjectId = li.catalogObjectId
    if (li?.variationName) item.variationName = li.variationName
    return item
  })

  const placedAt = toDate(squareOrder?.closedAt) ?? toDate(squareOrder?.createdAt)

  return {
    squareOrderId: squareOrder?.id,
    squarePaymentId: bridge.squarePaymentId,
    userId: bridge.userId,
    buyerEmail: bridge.buyerEmail,
    squareCustomerId: bridge.squareCustomerId,
    status: 'completed',
    totalCents: toCents(squareOrder?.totalMoney?.amount),
    currency: squareOrder?.totalMoney?.currency ?? 'USD',
    lineItems,
    fulfillmentState: mostAdvancedFulfillmentState(squareOrder?.fulfillments),
    placedAt,
    raw: toJsonSafe(squareOrder),
    shipping: bridge.shipping ?? null
  }
}
