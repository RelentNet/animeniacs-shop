import type { Order } from '@/lib/db/schema'
import { fulfillmentLabel, statusLabel } from '@/lib/orders/labels'
import type { Route } from 'next'
import Link from 'next/link'

/** $X.XX from integer cents. Mirrors the per-file helper used across order views. */
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

const cellStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', verticalAlign: 'top' }

/**
 * Server-rendered admin order list. Each row links to the detail page by the
 * internal order id. Reuses statusLabel/fulfillmentLabel so admin + customer
 * surfaces never drift.
 */
export function OrdersTable({ orders }: { orders: Order[] }): JSX.Element {
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead>
        <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
          <th style={cellStyle}>Order #</th>
          <th style={cellStyle}>Placed</th>
          <th style={cellStyle}>Buyer</th>
          <th style={cellStyle}>Total</th>
          <th style={cellStyle}>Status</th>
          <th style={cellStyle}>Fulfillment</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id} style={{ borderBottom: '1px solid #eee' }}>
            <td style={cellStyle}>
              <Link href={`/admin/orders/${o.id}` as Route}>
                <code>{o.squareOrderId}</code>
              </Link>
            </td>
            <td style={cellStyle}>{formatDate(o.placedAt)}</td>
            <td style={cellStyle}>{o.buyerEmail ?? '—'}</td>
            <td style={cellStyle}>{formatCents(o.totalCents)}</td>
            <td style={cellStyle}>{statusLabel(o.status)}</td>
            <td style={cellStyle}>{fulfillmentLabel(o.fulfillmentState)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
