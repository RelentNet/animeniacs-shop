'use server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { appendOrderLog } from '@/lib/db/queries/order-log'
import { getOrderById } from '@/lib/db/queries/orders'
import {
  ADMIN_TARGET_STATES,
  type FulfillmentState,
  NoFulfillmentError,
  advanceFulfillment
} from '@/lib/square/fulfillment'
import { issueFullRefund } from '@/lib/square/refunds'
import { reconcileFulfillmentFromSquare, reconcileRefundFromSquare } from '@/lib/webhooks/reconcile'
import { revalidatePath } from 'next/cache'

/** useFormState shape for the mutating order actions. */
export type OrderActionState = { ok: true } | { error: string } | undefined

const MAX_REASON_LEN = 500

/** Defense-in-depth admin re-check (spec §7): these actions move money / call
 * external APIs and must never run on a layout-bypass. */
async function requireAdmin(): Promise<{ email: string } | { error: string }> {
  const user = await getCurrentUser()
  if (!user.isAuthenticated || !user.roles.includes('admin')) {
    return { error: 'Not authorized — admin role required.' }
  }
  return { email: user.email ?? 'unknown' }
}

/**
 * Issue a FULL refund against an order (operator decision: full-only). Re-checks
 * admin, requires a typed `REFUND` confirmation + non-empty reason, re-reads the
 * order, calls Square, then reconciles the DB via the shared webhook path
 * (optimistic — the refund.* webhook also reconciles; same math, idempotent).
 * Writes an audit row to order_log and revalidates the detail + list.
 */
export async function issueRefundAction(
  orderId: string,
  _prev: OrderActionState,
  form: FormData
): Promise<OrderActionState> {
  const admin = await requireAdmin()
  if ('error' in admin) return admin

  const confirm = String(form.get('confirm') ?? '')
  if (confirm !== 'REFUND') {
    return { error: 'Type REFUND to confirm the refund.' }
  }
  const reason = String(form.get('reason') ?? '').trim()
  if (!reason) {
    return { error: 'A refund reason is required.' }
  }
  const cappedReason = reason.slice(0, MAX_REASON_LEN)

  const order = await getOrderById(orderId)
  if (!order) {
    return { error: 'Order not found.' }
  }

  // Re-validate guard state inside the action (double-submit / stale page).
  if (order.status !== 'completed' || (order.refundedCents ?? 0) !== 0) {
    return { error: 'This order can no longer be refunded (already refunded or not completed).' }
  }

  let refundId: string
  try {
    const result = await issueFullRefund({ order, reason: cappedReason })
    refundId = result.refundId
    // Optimistic reconcile via the shared webhook path so the admin sees the
    // refunded state immediately; idempotent with the refund.* webhook.
    await reconcileRefundFromSquare(order.squareOrderId)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Refund failed.' }
  }

  await appendOrderLog({
    squareOrderId: order.squareOrderId,
    eventType: 'admin.refund.issued',
    eventId: null,
    payload: {
      adminEmail: admin.email,
      amountCents: order.totalCents - (order.refundedCents ?? 0),
      reason: cappedReason,
      squareRefundId: refundId
    }
  })

  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  return { ok: true }
}

/**
 * Push a fulfillment-state change to Square (Square stays source of truth).
 * Re-checks admin, validates the target state, calls Square (which validates the
 * transition + handles the no-fulfillment case via NoFulfillmentError),
 * reconciles the DB via the shared webhook path, audits, and revalidates.
 */
export async function advanceFulfillmentAction(
  orderId: string,
  _prev: OrderActionState,
  form: FormData
): Promise<OrderActionState> {
  const admin = await requireAdmin()
  if ('error' in admin) return admin

  const toState = String(form.get('toState') ?? '') as FulfillmentState
  if (!ADMIN_TARGET_STATES.includes(toState)) {
    return { error: `Invalid fulfillment target: "${toState}".` }
  }

  const order = await getOrderById(orderId)
  if (!order) {
    return { error: 'Order not found.' }
  }

  let fromState: string
  try {
    const result = await advanceFulfillment({ squareOrderId: order.squareOrderId, toState })
    fromState = result.fromState
    // Optimistic reconcile via the shared webhook path; idempotent with the
    // order.fulfillment.updated webhook.
    await reconcileFulfillmentFromSquare(order.squareOrderId)
  } catch (err) {
    if (err instanceof NoFulfillmentError) {
      return { error: err.message }
    }
    return { error: err instanceof Error ? err.message : 'Fulfillment update failed.' }
  }

  await appendOrderLog({
    squareOrderId: order.squareOrderId,
    eventType: 'admin.fulfillment.advanced',
    eventId: null,
    payload: { adminEmail: admin.email, fromState, toState }
  })

  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  return { ok: true }
}
