import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getOrdersForUser } from '@/lib/db/queries/orders'
import { fulfillmentLabel, statusLabel } from '@/lib/orders/labels'
import type { Route } from 'next'
import Link from 'next/link'

export const metadata = {
  title: 'Order history | Animeniacs',
  description: 'Your past orders.'
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatDate(date: Date | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

export default async function OrdersPage(): Promise<JSX.Element> {
  const user = await getCurrentUser()
  const orders = user.userId ? await getOrdersForUser(user.userId) : []

  return (
    <div>
      <p className="eyebrow">Account</p>
      <h1 className="mt-2 font-display text-4xl tracking-wide text-bone sm:text-5xl">
        Order history
      </h1>

      {orders.length === 0 ? (
        <p className="mt-6 text-muted">You have no orders yet.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {orders.map((order) => (
            <li
              key={order.id}
              className="rounded-lg border border-line bg-wall transition hover:border-line-strong"
            >
              <Link
                href={`/account/orders/${order.id}` as Route}
                aria-label={`View order from ${formatDate(order.placedAt)}`}
                className="group flex items-center justify-between gap-4 p-4 hover:no-underline"
              >
                <span className="text-sm text-muted">{formatDate(order.placedAt)}</span>
                <span className="font-mono font-semibold text-bone">
                  {formatCents(order.totalCents)}
                </span>
                <span className="text-sm text-muted">{statusLabel(order.status)}</span>
                <span className="text-sm text-muted">
                  {fulfillmentLabel(order.fulfillmentState)}
                </span>
                <span
                  aria-hidden
                  className="text-sm text-neon-soft transition-colors group-hover:text-neon"
                >
                  View &rarr;
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
