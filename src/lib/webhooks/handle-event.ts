import 'server-only'
import { getCartBySquareOrderId, markCartCompleted } from '@/lib/db/queries/abandoned-carts'
import { appendOrderLog, hasEventId } from '@/lib/db/queries/order-log'
import { getOrderBySquareOrderId, upsertOrder } from '@/lib/db/queries/orders'
import { sendDiscordOrderNotification } from '@/lib/notifications/discord'
import { sendOrderConfirmationEmail, sendRefundEmail } from '@/lib/notifications/email'
import { notifyEnabledRecipients } from '@/lib/notifications/sms'
import { type OrderLineItem, buildOrder } from '@/lib/orders/build-order'
import { getSquareClient } from '@/lib/square/client'
import { reconcileFulfillmentFromSquare, reconcileRefundFromSquare } from '@/lib/webhooks/reconcile'

export interface HandleEventArgs {
  // biome-ignore lint/suspicious/noExplicitAny: Square event payload
  event: any
  webhookUrl: string
  signatureKey: string
}

function extractOrderId(event: { type: string; data?: { object?: unknown } }): string {
  // biome-ignore lint/suspicious/noExplicitAny: walking payload
  const obj: any = event.data?.object ?? {}
  if (event.type.startsWith('payment.')) return obj.payment?.order_id ?? '(unknown)'
  if (event.type === 'order.fulfillment.updated') {
    return obj.order_fulfillment_updated?.order_id ?? '(unknown)'
  }
  if (event.type.startsWith('order.')) return obj.order?.id ?? '(unknown)'
  if (event.type.startsWith('refund.')) return obj.refund?.order_id ?? '(unknown)'
  return '(unknown)'
}

function extractTotalCents(event: { data?: { object?: unknown } }): number {
  // biome-ignore lint/suspicious/noExplicitAny: walking payload
  const amount = (event.data?.object as any)?.payment?.total_money?.amount
  if (typeof amount === 'bigint') return Number(amount)
  if (typeof amount === 'number') return amount
  return 0
}

function extractBuyerEmail(event: { data?: { object?: unknown } }): string | null {
  // biome-ignore lint/suspicious/noExplicitAny: walking payload
  const email = (event.data?.object as any)?.payment?.buyer_email_address
  return typeof email === 'string' && email.length > 0 ? email : null
}

function extractPaymentId(event: { data?: { object?: unknown } }): string | null {
  // biome-ignore lint/suspicious/noExplicitAny: walking payload
  const id = (event.data?.object as any)?.payment?.id
  return typeof id === 'string' && id.length > 0 ? id : null
}

function extractRefundPaymentId(event: { data?: { object?: unknown } }): string | null {
  // biome-ignore lint/suspicious/noExplicitAny: walking payload
  const id = (event.data?.object as any)?.refund?.payment_id
  return typeof id === 'string' && id.length > 0 ? id : null
}

function countItemsInSnapshot(snapshot: unknown): number {
  // biome-ignore lint/suspicious/noExplicitAny: snapshot is jsonb
  const items: any[] | undefined = (snapshot as any)?.items
  if (!Array.isArray(items)) return 0
  return items.reduce((sum, e) => sum + (typeof e?.quantity === 'number' ? e.quantity : 0), 0)
}

function toCents(amount: unknown): number {
  if (typeof amount === 'bigint') return Number(amount)
  if (typeof amount === 'number') return amount
  return 0
}

function shopUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? ''
}

/** Fetch the authoritative Square order, or null on any failure. */
async function fetchSquareOrder(squareOrderId: string): Promise<unknown | null> {
  const resp = await getSquareClient().orders.get({ orderId: squareOrderId })
  // biome-ignore lint/suspicious/noExplicitAny: SDK response shape varies
  return (resp as any).order ?? null
}

/**
 * `payment.created`: mark the cart completed, fan out Discord + SMS, record the
 * order into our durable read model, and (NEW) email the buyer a receipt. Every
 * side effect is best-effort — failures log and continue, never throw.
 */
async function handlePaymentCreated(
  // biome-ignore lint/suspicious/noExplicitAny: Square event payload
  event: any,
  squareOrderId: string
): Promise<void> {
  await markCartCompleted(squareOrderId)
  const cart = await getCartBySquareOrderId(squareOrderId)
  const itemCount = cart ? countItemsInSnapshot(cart.cartSnapshot) : 0
  const totalCents = extractTotalCents(event)
  const buyerEmail = extractBuyerEmail(event)

  const discordUrl = process.env.DISCORD_ORDER_WEBHOOK_URL
  if (discordUrl) {
    try {
      await sendDiscordOrderNotification({
        webhookUrl: discordUrl,
        orderId: squareOrderId,
        totalCents,
        itemCount,
        buyerEmail
      })
    } catch (err) {
      console.error('[webhook] discord failed:', err)
    }
  }

  try {
    await notifyEnabledRecipients({ orderId: squareOrderId, totalCents, itemCount })
  } catch (err) {
    console.error('[webhook] sms fanout failed:', err)
  }

  // Record the completed order into our durable read model. Best-effort:
  // notifications already succeeded, so an order-recording failure must log +
  // continue, never throw out of the webhook. Idempotent via upsert on
  // squareOrderId; duplicate deliveries are already filtered by alreadySeen.
  try {
    const squareOrder = await fetchSquareOrder(squareOrderId)
    if (squareOrder) {
      const effectiveEmail = cart?.buyerEmail ?? buyerEmail
      const order = buildOrder(squareOrder, {
        userId: cart?.buyerUserId ?? null,
        buyerEmail: effectiveEmail,
        squareCustomerId: cart?.squareCustomerId ?? null,
        squarePaymentId: extractPaymentId(event)
      })
      await upsertOrder(order)

      // NEW (Phase 13): receipt email, best-effort + env-gated (no-ops without
      // Resend). Skipped entirely when no buyer email is known.
      if (effectiveEmail) {
        try {
          const items = (order.lineItems as OrderLineItem[]).map((li) => ({
            name: li.name,
            quantity: li.quantity,
            totalCents: li.totalCents
          }))
          await sendOrderConfirmationEmail({
            to: effectiveEmail,
            orderId: squareOrderId,
            items,
            totalCents: order.totalCents,
            shopUrl: shopUrl()
          })
        } catch (err) {
          console.error('[webhook] confirmation email failed:', err)
        }
      }
    }
  } catch (err) {
    console.error('[webhook] order recording failed:', err)
  }
}

/**
 * `refund.created` / `refund.updated`: refund status + refundedCents are
 * SERVER-COMPUTED from the authoritative Square PAYMENT — keyed by the refund's
 * `payment_id`, NOT its `order_id` (Square books refunds onto a separate $0
 * "refund order", so refund.order_id ≠ the sale order). The reconcile helper
 * resolves the sale order via the payment. Best-effort; failures log + continue.
 */
async function handleRefund(paymentId: string | null): Promise<void> {
  if (!paymentId) return
  try {
    // Status + refundedCents recompute lives in the shared reconcile helper so
    // the webhook and any caller never fork the math.
    const reconciled = await reconcileRefundFromSquare(paymentId)
    if (!reconciled) return

    // Best-effort refund email to the buyer. The buyer email is identity, read
    // from our stored order row (the sale order resolved from the payment);
    // amounts are the server-computed Square values.
    try {
      const stored = await getOrderBySquareOrderId(reconciled.orderId)
      if (stored?.buyerEmail) {
        await sendRefundEmail({
          to: stored.buyerEmail,
          orderId: reconciled.orderId,
          refundedCents: reconciled.refundedCents,
          totalCents: stored.totalCents,
          shopUrl: shopUrl()
        })
      }
    } catch (err) {
      console.error('[webhook] refund email failed:', err)
    }
  } catch (err) {
    console.error('[webhook] refund handling failed:', err)
  }
}

/**
 * `order.fulfillment.updated`: capture the most-advanced fulfillment state from
 * the authoritative Square order. Best-effort; failures log and continue.
 */
async function handleFulfillmentUpdated(squareOrderId: string): Promise<void> {
  try {
    await reconcileFulfillmentFromSquare(squareOrderId)
  } catch (err) {
    console.error('[webhook] fulfillment update failed:', err)
  }
}

export async function handleSquareEvent(args: HandleEventArgs): Promise<void> {
  const { event } = args
  const squareOrderId = extractOrderId(event)
  const eventId: string | null = event.event_id ?? null

  // Idempotency check BEFORE log + fanout. If this event_id was already
  // recorded, just log the duplicate delivery and skip all handlers.
  const alreadySeen = eventId ? await hasEventId(eventId) : false

  await appendOrderLog({
    squareOrderId,
    eventType: event.type,
    eventId,
    payload: event
  })

  if (alreadySeen) return

  // Route by event type. Each handler owns its own best-effort try/catch so a
  // failure in one side effect never throws out of the webhook.
  if (event.type === 'payment.created') {
    await handlePaymentCreated(event, squareOrderId)
  } else if (event.type.startsWith('refund.')) {
    await handleRefund(extractRefundPaymentId(event))
  } else if (event.type === 'order.fulfillment.updated') {
    await handleFulfillmentUpdated(squareOrderId)
  }
}
