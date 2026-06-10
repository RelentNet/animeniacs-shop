import type { Order } from '@/lib/db/schema'
import type { OrderLineItem } from '@/lib/orders/build-order'
import { fulfillmentLabel, statusLabel } from '@/lib/orders/labels'

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

/**
 * Presentational, read-only order view shared by the account order-detail page
 * and the public guest-lookup result. Takes an `Order`-shaped row; renders the
 * placed date, friendly status + fulfillment labels, total, an optional refunded
 * line, and the line items. No data fetching, no auth — callers own those.
 */
export function OrderDetailView({ order }: { order: Order }): JSX.Element {
  const lineItems = (order.lineItems as OrderLineItem[]) ?? []
  const refundedCents = order.refundedCents ?? 0

  return (
    <div>
      <h1 className="text-3xl font-bold">Order</h1>
      <p className="mt-1 text-sm text-gray-500">
        Order number: <code>{order.squareOrderId}</code>
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:max-w-md">
        <dt className="text-gray-500">Placed</dt>
        <dd className="text-gray-900">{formatDate(order.placedAt)}</dd>
        <dt className="text-gray-500">Status</dt>
        <dd className="text-gray-900">{statusLabel(order.status)}</dd>
        <dt className="text-gray-500">Fulfillment</dt>
        <dd className="text-gray-900">{fulfillmentLabel(order.fulfillmentState)}</dd>
        <dt className="text-gray-500">Total</dt>
        <dd className="font-semibold text-gray-900">{formatCents(order.totalCents)}</dd>
        {refundedCents > 0 && (
          <>
            <dt className="text-gray-500">Refunded</dt>
            <dd className="font-semibold text-gray-900">
              {formatCents(refundedCents)} of {formatCents(order.totalCents)}
            </dd>
          </>
        )}
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
