import 'server-only'
import type { Order } from '@/lib/db/schema'
import { getSquareClient } from '@/lib/square/client'

export interface IssueFullRefundArgs {
  /** The stored order row being refunded. Guards read its fields. */
  order: Order
  /** Admin-supplied reason; passed to Square (trimmed/capped by the caller). */
  reason?: string
}

export interface IssueFullRefundResult {
  refundId: string
  status: string | undefined
}

/**
 * Issue a FULL refund against the order's Square payment (operator decision:
 * full-only). Guards (no Square call unless all pass):
 *   - squarePaymentId present
 *   - status === 'completed'
 *   - refundedCents === 0 (not already refunded)
 *   - remaining = totalCents - refundedCents > 0
 * Does NOT write the DB — the refund.* webhook (and the action's optimistic
 * reconcile) recompute refundedCents/status from the authoritative Square order.
 * idempotencyKey is stable per order (full-only ⇒ at most one refund per order).
 */
export async function issueFullRefund(args: IssueFullRefundArgs): Promise<IssueFullRefundResult> {
  const { order, reason } = args

  if (!order.squarePaymentId) {
    throw new Error('Cannot refund: order has no Square payment id.')
  }
  if (order.status !== 'completed') {
    throw new Error(`Cannot refund: order status is "${order.status}", expected "completed".`)
  }
  if ((order.refundedCents ?? 0) !== 0) {
    throw new Error('Cannot refund: order has already been refunded.')
  }
  const remaining = order.totalCents - (order.refundedCents ?? 0)
  if (remaining <= 0) {
    throw new Error('Cannot refund: no refundable amount remaining.')
  }

  const res = await getSquareClient().refunds.refundPayment({
    idempotencyKey: `refund_${order.squareOrderId}`,
    paymentId: order.squarePaymentId,
    // biome-ignore lint/suspicious/noExplicitAny: Money.currency is a Currency enum; our DB stores a plain string
    amountMoney: { amount: BigInt(remaining), currency: order.currency as any },
    ...(reason ? { reason } : {})
  })

  // biome-ignore lint/suspicious/noExplicitAny: SDK response shape varies
  const refund = (res as any).refund
  if (!refund?.id) {
    throw new Error('Square refundPayment returned no refund.')
  }
  return { refundId: refund.id, status: refund.status }
}
