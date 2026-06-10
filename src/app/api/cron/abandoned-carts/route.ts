import {
  getCartsForReminder,
  markReminderSent
} from '@/lib/db/queries/abandoned-carts'
import type { CartSnapshot } from '@/lib/notifications/email'
import { sendAbandonedCartEmail } from '@/lib/notifications/email'
import { NextResponse } from 'next/server'

/**
 * POST /api/cron/abandoned-carts
 *
 * Secured by the x-cron-secret header. Finds pending abandoned_carts
 * rows with a non-null buyer_email, older than ABANDONED_CART_THRESHOLD_MINUTES
 * (default 60), with no reminder sent yet. Sends one Resend recovery
 * email per cart, then stamps reminder_sent_at and sets status='abandoned'.
 *
 * Idempotent: reminder_sent_at IS NULL guards against double-sends.
 * One email per cart ever.
 *
 * Trigger: wire an external cron (Coolify scheduled task, GitHub Actions
 * schedule, or any cron service) to POST to this URL with the x-cron-secret
 * header. Recommended frequency: every 15 minutes.
 *
 * Returns: { processed: N } on success, { processed: N, errors: M } if
 * some carts failed (those are logged + skipped, not aborted).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET
  const incoming = request.headers.get('x-cron-secret')

  if (!cronSecret || incoming !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const thresholdMinutes = Number(process.env.ABANDONED_CART_THRESHOLD_MINUTES ?? '60')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''

  const carts = await getCartsForReminder(thresholdMinutes)

  let processed = 0
  let errors = 0

  for (const cart of carts) {
    try {
      await sendAbandonedCartEmail({
        to: cart.buyerEmail,
        cartSnapshot: cart.cartSnapshot as CartSnapshot,
        shopUrl: siteUrl
      })
      await markReminderSent(cart.cartId)
      processed++
    } catch (err) {
      console.error(`[cron/abandoned-carts] failed for cart ${cart.cartId}:`, err)
      errors++
    }
  }

  const body: Record<string, number> = { processed }
  if (errors > 0) body.errors = errors

  return NextResponse.json(body)
}
