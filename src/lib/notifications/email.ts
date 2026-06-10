import 'server-only'
import { Resend } from 'resend'

export interface CartSnapshot {
  items: Array<{ catalogItemId: string; quantity: number }>
}

/**
 * Sends a single abandoned-cart recovery email via Resend.
 *
 * Silently no-ops if RESEND_API_KEY or RESEND_FROM_EMAIL is not set —
 * missing env is treated as "email not configured" rather than a crash.
 * This lets the cron route run safely in environments that haven't set
 * up Resend yet.
 *
 * One email per cart ever — idempotency is enforced upstream by the
 * cron route checking reminder_sent_at IS NULL before calling this.
 */
export async function sendAbandonedCartEmail(opts: {
  to: string
  cartSnapshot: CartSnapshot
  shopUrl: string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL

  if (!apiKey || !from) {
    console.warn(
      '[email] sendAbandonedCartEmail: RESEND_API_KEY or RESEND_FROM_EMAIL not set — skipping'
    )
    return
  }

  const resend = new Resend(apiKey)

  const itemLines = opts.cartSnapshot.items
    .map((item) => `  • ${item.quantity}× ${item.catalogItemId}`)
    .join('\n')

  const text = [
    'Hi,',
    '',
    'You left some items in your cart at Animeniacs. Come back and complete your order:',
    '',
    itemLines || '  (your cart items)',
    '',
    `Shop now: ${opts.shopUrl}/shop`,
    '',
    '— The Animeniacs Team'
  ].join('\n')

  await resend.emails.send({
    from,
    to: opts.to,
    subject: 'You left something in your cart',
    text
  })
}
