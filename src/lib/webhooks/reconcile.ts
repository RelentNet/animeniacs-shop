import 'server-only'
import {
  setOrderFulfillmentState,
  updateOrderRaw,
  updateOrderStatus
} from '@/lib/db/queries/orders'
import { mostAdvancedFulfillmentState } from '@/lib/orders/build-order'
import { toJsonSafe } from '@/lib/orders/json-safe'
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
 * Re-derive refund status + refundedCents for the ORIGINAL sale order from the
 * authoritative Square PAYMENT — keyed by paymentId, NOT the refund's order_id.
 * Square books a refund onto a separate $0 "refund order", so `refund.order_id`
 * is NOT the sale order and the sale order's own `refunds[]` stays empty; the
 * cumulative refunded amount lives on the PAYMENT (`refundedMoney`), whose
 * `orderId` is the sale order we stored as `squareOrderId`. Full-vs-partial is
 * decided against the sale order's total. Returns the values written + the sale
 * orderId (or null if unresolvable). Does NOT send email — the webhook owns that.
 */
export async function reconcileRefundFromSquare(
  paymentId: string
): Promise<{ status: 'refunded' | 'partially_refunded'; refundedCents: number; orderId: string } | null> {
  // biome-ignore lint/suspicious/noExplicitAny: Square payment shape is loose
  const payment = (await getSquareClient().payments.get({ paymentId })).payment as any
  const orderId: string | undefined = payment?.orderId
  if (!orderId) return null

  const refundedCents = toCents(payment?.refundedMoney?.amount)
  // biome-ignore lint/suspicious/noExplicitAny: Square order shape is loose
  const order = (await fetchSquareOrder(orderId)) as any
  const totalCents = toCents(order?.totalMoney?.amount)
  const status: 'refunded' | 'partially_refunded' =
    refundedCents >= totalCents && totalCents > 0 ? 'refunded' : 'partially_refunded'

  await updateOrderStatus(orderId, status, refundedCents)
  // Refresh the SALE order's raw snapshot (orderId resolved via payment.orderId,
  // NOT the synthetic $0 refund order) so the admin log mirrors Square's current
  // order state. BigInt-safe via the shared sanitizer (raw Money is bigint).
  if (order) await updateOrderRaw(orderId, toJsonSafe(order))
  return { status, refundedCents, orderId }
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
  // Refresh raw so the admin log reflects the current Square order state +
  // shipment details. BigInt-safe via the shared sanitizer (raw Money is bigint).
  await updateOrderRaw(squareOrderId, toJsonSafe(squareOrder))
  return state
}
