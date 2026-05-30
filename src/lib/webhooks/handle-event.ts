import 'server-only'
import { getCartBySquareOrderId, markCartCompleted } from '@/lib/db/queries/abandoned-carts'
import { appendOrderLog, hasEventId } from '@/lib/db/queries/order-log'
import { sendDiscordOrderNotification } from '@/lib/notifications/discord'
import { notifyEnabledRecipients } from '@/lib/notifications/sms'

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

function countItemsInSnapshot(snapshot: unknown): number {
  // biome-ignore lint/suspicious/noExplicitAny: snapshot is jsonb
  const items: any[] | undefined = (snapshot as any)?.items
  if (!Array.isArray(items)) return 0
  return items.reduce(
    (sum, e) => sum + (typeof e?.quantity === 'number' ? e.quantity : 0),
    0
  )
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
}
