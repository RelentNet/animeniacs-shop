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
 * sms-edge contract (verified against the live server + the
 * @itkujo/sms-core default template renderer):
 *   POST {SMSEDGE_BASE_URL}/sms
 *   Authorization: Bearer {SMSEDGE_TOKEN}
 *   Content-Type: application/json
 *   { "to": "+E164", "type": "Generic", "payload": { "text": "..." } }
 *
 * `SmsType` built-ins are SignIn / Register / ForgotPassword / Test
 * (all OTP, require payload.code) and `Generic` (free text, requires a
 * non-empty payload.text). Order alerts are arbitrary text, so we use
 * `Generic` and build the body client-side.
 *
 * Tenant `animeniacs` provisioned in sms-edge; SMSEDGE_TOKEN is the
 * per-tenant API token (NOT a user/password). Cannot be retrieved
 * from sms-edge after creation — recorded once in .env.local +
 * Coolify env.
 *
 * History:
 *   - Phase 7 used SMSGATE_USER/SMSGATE_PASS Basic auth + /send (wrong).
 *   - Phase 7.5/A.0 fixed auth/path/host but kept a flat {to,message}
 *     body → sms-edge 400 (wants {to,type,payload}).
 *   - Phase 7.5/B.8 first tried a non-existent `OrderAlert` template →
 *     sms-edge 500 ("unknown SMS type"). Final fix: `Generic` + text.
 *     Also logs non-2xx status (sends previously failed silently).
 */
export async function sendOrderSms(args: SendSmsArgs): Promise<void> {
  const baseUrl = process.env.SMSEDGE_BASE_URL
  const token = process.env.SMSEDGE_TOKEN
  if (!baseUrl || !token) {
    console.error('[sms] missing SMSEDGE_* env vars; skipping send')
    return
  }
  try {
    const res = await fetch(`${baseUrl}/sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        to: args.recipient.phone,
        type: 'Generic',
        payload: {
          text: buildMessage({
            orderId: args.orderId,
            totalCents: args.totalCents,
            itemCount: args.itemCount
          })
        }
      })
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error(`[sms] send to ${args.recipient.phone} returned ${res.status}: ${detail}`)
    }
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
