import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getOrderById } from '@/lib/db/queries/orders'
import type { OrderLineItem } from '@/lib/orders/build-order'
import type { Route } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const metadata = {
  title: 'Order detail | Animeniacs'
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

export default async function OrderDetailPage({
  params
}: {
  params: { id: string }
}): Promise<JSX.Element> {
  const [user, order] = await Promise.all([getCurrentUser(), getOrderById(params.id)])

  // IDOR guard: 404 (not 403, to avoid confirming existence) unless the order
  // belongs to the current user. Spec §8 — this is the key ownership invariant.
  if (!order || order.userId !== user.userId) {
    notFound()
  }

  const lineItems = (order.lineItems as OrderLineItem[]) ?? []

  return (
    <div>
      <Link href={'/account/orders' as Route} className="text-sm text-gray-600 hover:underline">
        &larr; Back to order history
      </Link>

      <h1 className="mt-3 text-3xl font-bold">Order</h1>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:max-w-md">
        <dt className="text-gray-500">Placed</dt>
        <dd className="text-gray-900">{formatDate(order.placedAt)}</dd>
        <dt className="text-gray-500">Status</dt>
        <dd className="capitalize text-gray-900">{order.status}</dd>
        <dt className="text-gray-500">Total</dt>
        <dd className="font-semibold text-gray-900">{formatCents(order.totalCents)}</dd>
      </dl>

      <h2 className="mt-8 text-xl font-semibold">Items</h2>
      <ul className="mt-3 divide-y divide-gray-200 border-y border-gray-200">
        {lineItems.map((item, i) => (
          <li
            key={`${item.catalogObjectId ?? item.name}-${i}`}
            className="flex justify-between py-3"
          >
            <div>
              <p className="font-medium text-gray-900">{item.name}</p>
              <p className="text-sm text-gray-500">
                {item.quantity} &times; {formatCents(item.unitPriceCents)}
                {item.variationName ? ` · ${item.variationName}` : ''}
              </p>
            </div>
            <p className="font-medium text-gray-900">{formatCents(item.totalCents)}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
