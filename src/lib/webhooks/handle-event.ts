import 'server-only'
import { getCartBySquareOrderId, markCartCompleted } from '@/lib/db/queries/abandoned-carts'
import { appendOrderLog, hasEventId } from '@/lib/db/queries/order-log'
import { upsertOrder } from '@/lib/db/queries/orders'
import { sendDiscordOrderNotification } from '@/lib/notifications/discord'
import { notifyEnabledRecipients } from '@/lib/notifications/sms'
import { buildOrder } from '@/lib/orders/build-order'
import { getSquareClient } from '@/lib/square/client'

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

function countItemsInSnapshot(snapshot: unknown): number {
  // biome-ignore lint/suspicious/noExplicitAny: snapshot is jsonb
  const items: any[] | undefined = (snapshot as any)?.items
  if (!Array.isArray(items)) return 0
  return items.reduce((sum, e) => sum + (typeof e?.quantity === 'number' ? e.quantity : 0), 0)
}

export async function handleSquareEvent(args: HandleEventArgs): Promise<void> {
  const { event } = args
  const squareOrderId = extractOrderId(event)
  const eventId: string | null = event.event_id ?? null

  // Idempotency check BEFORE log + fanout. If this event_id was already
  // recorded, just log the duplicate delivery and skip fanout.
  const alreadySeen = eventId ? await hasEventId(eventId) : false

  await appendOrderLog({
    squareOrderId,
    eventType: event.type,
    eventId,
    payload: event
  })

  if (alreadySeen) return

  if (event.type !== 'payment.created') return

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
    const resp = await getSquareClient().orders.get({ orderId: squareOrderId })
    // biome-ignore lint/suspicious/noExplicitAny: SDK response shape varies
    const squareOrder = (resp as any).order
    if (squareOrder) {
      await upsertOrder(
        buildOrder(squareOrder, {
          userId: cart?.buyerUserId ?? null,
          buyerEmail: cart?.buyerEmail ?? buyerEmail,
          squareCustomerId: cart?.squareCustomerId ?? null,
          squarePaymentId: extractPaymentId(event)
        })
      )
    }
  } catch (err) {
    console.error('[webhook] order recording failed:', err)
  }
}
