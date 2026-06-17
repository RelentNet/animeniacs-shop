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
      <p className="eyebrow">Receipt</p>
      <h1 className="mt-2 font-display text-4xl tracking-wide text-bone sm:text-5xl">Order</h1>
      <p className="mt-1 text-sm text-muted">
        Order number: <code className="font-mono text-purple-soft">{order.squareOrderId}</code>
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:max-w-md">
        <dt className="text-muted">Placed</dt>
        <dd className="text-bone">{formatDate(order.placedAt)}</dd>
        <dt className="text-muted">Status</dt>
        <dd className="text-bone">{statusLabel(order.status)}</dd>
        <dt className="text-muted">Fulfillment</dt>
        <dd className="text-bone">{fulfillmentLabel(order.fulfillmentState)}</dd>
        <dt className="text-muted">Total</dt>
        <dd className="font-mono font-semibold text-neon neon-text">
          {formatCents(order.totalCents)}
        </dd>
        {refundedCents > 0 && (
          <>
            <dt className="text-muted">Refunded</dt>
            <dd className="font-semibold text-bone">
              {formatCents(refundedCents)} of {formatCents(order.totalCents)}
            </dd>
          </>
        )}
      </dl>

      <h2 className="eyebrow mt-8 text-purple-soft">Items</h2>
      <ul className="mt-3 divide-y divide-line border-y border-line">
        {lineItems.map((item, i) => (
          <li
            key={`${item.catalogObjectId ?? item.name}-${i}`}
            className="flex justify-between py-3"
          >
            <div>
              <p className="font-medium text-bone">{item.name}</p>
              <p className="text-sm text-muted">
                {item.quantity} &times; {formatCents(item.unitPriceCents)}
                {item.variationName ? ` · ${item.variationName}` : ''}
              </p>
            </div>
            <p className="font-mono font-medium text-bone">{formatCents(item.totalCents)}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
