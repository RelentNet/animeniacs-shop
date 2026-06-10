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
      <h1 className="text-3xl font-bold">Order history</h1>

      {orders.length === 0 ? (
        <p className="mt-6 text-gray-700">You have no orders yet.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {orders.map((order) => (
            <li
              key={order.id}
              className="rounded-lg border border-gray-200 p-4 transition hover:border-gray-400"
            >
              <Link
                href={`/account/orders/${order.id}` as Route}
                aria-label={`View order from ${formatDate(order.placedAt)}`}
                className="flex items-center justify-between gap-4"
              >
                <span className="text-sm text-gray-700">{formatDate(order.placedAt)}</span>
                <span className="font-semibold text-gray-900">{formatCents(order.totalCents)}</span>
                <span className="text-sm text-gray-500">{statusLabel(order.status)}</span>
                <span className="text-sm text-gray-500">
                  {fulfillmentLabel(order.fulfillmentState)}
                </span>
                <span aria-hidden className="text-gray-400">
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
