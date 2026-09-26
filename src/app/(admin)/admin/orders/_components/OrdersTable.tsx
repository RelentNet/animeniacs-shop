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

/** Square's literal order state (DRAFT/OPEN/COMPLETED/CANCELED) from raw, or null. */
function squareState(raw: unknown): string | null {
  // biome-ignore lint/suspicious/noExplicitAny: stored Square order snapshot is loose
  const state = (raw as any)?.state
  return typeof state === 'string' && state.length > 0 ? state : null
}

const th = 'py-2 px-3 font-medium'
const td = 'py-2 px-3 align-top'

/**
 * Server-rendered admin order list. Each row links to the detail page by the
 * internal order id. Reuses statusLabel/fulfillmentLabel so admin + customer
 * surfaces never drift.
 */
export function OrdersTable({ orders }: { orders: Order[] }): JSX.Element {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-line-strong text-left text-muted">
          <th className={th}>Order #</th>
          <th className={th}>Placed</th>
          <th className={th}>Buyer</th>
          <th className={th}>Total</th>
          <th className={th}>Status</th>
          <th className={th}>Square</th>
          <th className={th}>Fulfillment</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id} className="border-b border-line hover:bg-wall-2">
            <td className={td}>
              <Link href={`/admin/orders/${o.id}` as Route} className="link-neon">
                <code className="font-mono text-purple-soft">{o.squareOrderId}</code>
              </Link>
            </td>
            <td className={`${td} text-muted`}>{formatDate(o.placedAt)}</td>
            <td className={`${td} text-muted`}>{o.buyerEmail ?? '—'}</td>
            <td className={`${td} font-mono text-bone`}>{formatCents(o.totalCents)}</td>
            <td className={`${td} text-bone`}>{statusLabel(o.status)}</td>
            <td className={`${td} text-muted`}>
              {squareState(o.raw) ? <code className="font-mono">{squareState(o.raw)}</code> : '—'}
            </td>
            <td className={`${td} text-bone`}>{fulfillmentLabel(o.fulfillmentState)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
