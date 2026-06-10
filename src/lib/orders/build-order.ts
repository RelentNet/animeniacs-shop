import type { NewOrder } from '@/lib/db/schema'

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
    placedAt,
    raw: squareOrder
  }
}
