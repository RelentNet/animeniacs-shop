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

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export interface OrderEmailItem {
  name: string
  quantity: number
  totalCents: number
}

/**
 * Sends an order-confirmation receipt via Resend after `payment.created`.
 *
 * Env-gated identically to {@link sendAbandonedCartEmail} — silently no-ops when
 * RESEND_API_KEY or RESEND_FROM_EMAIL is unset. The receipt links to the account
 * order history (for signed-in buyers) and the guest lookup page (for guests).
 */
export async function sendOrderConfirmationEmail(opts: {
  to: string
  orderId: string
  items: OrderEmailItem[]
  totalCents: number
  shopUrl: string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL

  if (!apiKey || !from) {
    console.warn(
      '[email] sendOrderConfirmationEmail: RESEND_API_KEY or RESEND_FROM_EMAIL not set — skipping'
    )
    return
  }

  const resend = new Resend(apiKey)

  const itemLines = opts.items
    .map((item) => `  • ${item.quantity}× ${item.name} — ${formatCents(item.totalCents)}`)
    .join('\n')

  const text = [
    'Thanks for your order!',
    '',
    `Order number: ${opts.orderId}`,
    '',
    itemLines || '  (your order items)',
    '',
    `Total: ${formatCents(opts.totalCents)}`,
    '',
    `View your orders: ${opts.shopUrl}/account/orders`,
    `Ordered as a guest? Look it up anytime at ${opts.shopUrl}/orders/lookup using your email and this order number.`,
    '',
    '— The Animeniacs Team'
  ].join('\n')

  await resend.emails.send({
    from,
    to: opts.to,
    subject: `Your Animeniacs order ${opts.orderId}`,
    text
  })
}

/**
 * Sends a refund-notice email via Resend after a refund webhook.
 *
 * Env-gated identically to {@link sendAbandonedCartEmail} — silently no-ops when
 * RESEND_API_KEY or RESEND_FROM_EMAIL is unset.
 */
export async function sendRefundEmail(opts: {
  to: string
  orderId: string
  refundedCents: number
  totalCents: number
  shopUrl: string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL

  if (!apiKey || !from) {
    console.warn(
      '[email] sendRefundEmail: RESEND_API_KEY or RESEND_FROM_EMAIL not set — skipping'
    )
    return
  }

  const resend = new Resend(apiKey)

  const isFull = opts.refundedCents >= opts.totalCents
  const text = [
    'A refund has been issued for your order.',
    '',
    `Order number: ${opts.orderId}`,
    `Refunded: ${formatCents(opts.refundedCents)} of ${formatCents(opts.totalCents)}${
      isFull ? ' (full refund)' : ''
    }`,
    '',
    'It may take a few business days for the funds to appear on your statement.',
    '',
    `View your orders: ${opts.shopUrl}/account/orders`,
    '',
    '— The Animeniacs Team'
  ].join('\n')

  await resend.emails.send({
    from,
    to: opts.to,
    subject: `Refund for your Animeniacs order ${opts.orderId}`,
    text
  })
}
