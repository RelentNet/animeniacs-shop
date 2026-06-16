import 'server-only'
import { setOrderFulfillmentState, updateOrderStatus } from '@/lib/db/queries/orders'
import { mostAdvancedFulfillmentState } from '@/lib/orders/build-order'
import { getSquareClient } from '@/lib/square/client'

function toCents(amount: unknown): number {
  if (typeof amount === 'bigint') return Number(amount)
  if (typeof amount === 'number') return amount
  return 0
}

/** Fetch the authoritative Square order, or null on any failure. */
async function fetchSquareOrder(squareOrderId: string): Promise<unknown | null> {
  const resp = await getSquareClient().orders.get({ orderId: squareOrderId })
  // biome-ignore lint/suspicious/noExplicitAny: SDK response shape varies
  return (resp as any).order ?? null
}

/**
 * Re-derive refund status + refundedCents from the AUTHORITATIVE Square order
 * and write them via updateOrderStatus. This is the single source of the refund
 * math, shared by the refund.* webhook handler and the admin refund action so
 * neither forks the computation. Returns the values written (or null if the
 * order could not be fetched). Does NOT send email — the webhook owns that.
 */
export async function reconcileRefundFromSquare(
  squareOrderId: string
): Promise<{ status: 'refunded' | 'partially_refunded'; refundedCents: number } | null> {
  // biome-ignore lint/suspicious/noExplicitAny: Square order shape is loose
  const squareOrder = (await fetchSquareOrder(squareOrderId)) as any
  if (!squareOrder) return null

  const totalCents = toCents(squareOrder.totalMoney?.amount)
  const refunds: unknown[] = Array.isArray(squareOrder.refunds) ? squareOrder.refunds : []
  const refundedCents = refunds.reduce<number>(
    // biome-ignore lint/suspicious/noExplicitAny: Square refund shape is loose
    (sum, r) => sum + toCents((r as any)?.amountMoney?.amount),
    0
  )
  const status: 'refunded' | 'partially_refunded' =
    refundedCents >= totalCents && totalCents > 0 ? 'refunded' : 'partially_refunded'

  await updateOrderStatus(squareOrderId, status, refundedCents)
  return { status, refundedCents }
}

/**
 * Re-derive the most-advanced fulfillment state from the authoritative Square
 * order and persist it via setOrderFulfillmentState. Shared by the
 * order.fulfillment.updated webhook handler and the admin fulfillment action.
 * Returns the state written (or null if the order could not be fetched).
 */
export async function reconcileFulfillmentFromSquare(
  squareOrderId: string
): Promise<string | null> {
  // biome-ignore lint/suspicious/noExplicitAny: Square order shape is loose
  const squareOrder = (await fetchSquareOrder(squareOrderId)) as any
  if (!squareOrder) return null
  const state = mostAdvancedFulfillmentState(squareOrder.fulfillments)
  await setOrderFulfillmentState(squareOrderId, state)
  return state
}
