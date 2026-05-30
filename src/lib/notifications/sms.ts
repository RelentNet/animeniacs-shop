import 'server-only'
import { getEnabledRecipients } from '@/lib/db/queries/sms-recipients'

export interface SendSmsArgs {
  recipient: { phone: string; label: string | null }
  orderId: string
  totalCents: number
  itemCount: number
}

function buildMessage(args: { orderId: string; totalCents: number; itemCount: number }): string {
  return `New order $${(args.totalCents / 100).toFixed(2)} (${args.itemCount} items) on animeniacs.shop — order ${args.orderId}`
}

export async function sendOrderSms(args: SendSmsArgs): Promise<void> {
  const baseUrl = process.env.SMSGATE_BASE_URL
  const user = process.env.SMSGATE_USER
  const pass = process.env.SMSGATE_PASS
  if (!baseUrl || !user || !pass) {
    console.error('[sms] missing SMSGATE_* env vars; skipping send')
    return
  }
  try {
    await fetch(`${baseUrl}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`
      },
      body: JSON.stringify({
        to: args.recipient.phone,
        message: buildMessage({
          orderId: args.orderId,
          totalCents: args.totalCents,
          itemCount: args.itemCount
        })
      })
    })
  } catch (err) {
    console.error(`[sms] failed to send to ${args.recipient.phone}:`, err)
  }
}

export interface NotifyArgs {
  orderId: string
  totalCents: number
  itemCount: number
}

export async function notifyEnabledRecipients(args: NotifyArgs): Promise<void> {
  const recipients = await getEnabledRecipients()
  await Promise.all(
    recipients.map((r) =>
      sendOrderSms({
        recipient: { phone: r.phone, label: r.label },
        orderId: args.orderId,
        totalCents: args.totalCents,
        itemCount: args.itemCount
      })
    )
  )
}
