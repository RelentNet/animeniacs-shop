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

/**
 * Send a single order-confirmation SMS via sms-edge.
 *
 * sms-edge contract (verified via the sms-edge tenant dashboard):
 *   POST {SMSEDGE_BASE_URL}/sms
 *   Authorization: Bearer {SMSEDGE_TOKEN}
 *   Content-Type: application/json
 *   { "to": "+E164", "message": "..." }
 *
 * Tenant `animeniacs` provisioned in sms-edge; SMSEDGE_TOKEN is the
 * per-tenant API token (NOT a user/password). Cannot be retrieved
 * from sms-edge after creation — recorded once in .env.local +
 * Coolify env.
 *
 * Phase 7 originally used SMSGATE_USER/SMSGATE_PASS Basic auth +
 * /send — that was wrong; corrected in Phase 7.5/A.0.
 */
export async function sendOrderSms(args: SendSmsArgs): Promise<void> {
  const baseUrl = process.env.SMSEDGE_BASE_URL
  const token = process.env.SMSEDGE_TOKEN
  if (!baseUrl || !token) {
    console.error('[sms] missing SMSEDGE_* env vars; skipping send')
    return
  }
  try {
    await fetch(`${baseUrl}/sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
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
