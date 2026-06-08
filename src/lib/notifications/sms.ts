import 'server-only'
import { getEnabledRecipients } from '@/lib/db/queries/sms-recipients'

export interface SendSmsArgs {
  recipient: { phone: string; label: string | null }
  orderId: string
  totalCents: number
  itemCount: number
}

/**
 * Send a single order-confirmation SMS via sms-edge.
 *
 * sms-edge contract (verified against the live server + design spec §15):
 *   POST {SMSEDGE_BASE_URL}/sms
 *   Authorization: Bearer {SMSEDGE_TOKEN}
 *   Content-Type: application/json
 *   {
 *     "to": "+E164",
 *     "type": "OrderAlert",          // named server-side template
 *     "payload": { orderId, total, itemCount }
 *   }
 * The server renders the message body from the template + payload, so
 * the client sends structured fields, not a pre-built message string.
 *
 * Tenant `animeniacs` provisioned in sms-edge; SMSEDGE_TOKEN is the
 * per-tenant API token (NOT a user/password). Cannot be retrieved
 * from sms-edge after creation — recorded once in .env.local +
 * Coolify env.
 *
 * History:
 *   - Phase 7 used SMSGATE_USER/SMSGATE_PASS Basic auth + /send (wrong).
 *   - Phase 7.5/A.0 fixed auth/path/host but kept a flat {to,message}
 *     body, which sms-edge rejects with 400 (it wants {to,type,payload}).
 *   - Phase 7.5/B.8 corrected the body to the OrderAlert envelope and
 *     added response-status logging (sends previously failed silently).
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
        type: 'OrderAlert',
        payload: {
          orderId: args.orderId,
          total: args.totalCents,
          itemCount: args.itemCount
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
