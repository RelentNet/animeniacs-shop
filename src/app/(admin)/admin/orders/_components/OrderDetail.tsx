import type { Order } from '@/lib/db/schema'
import type { OrderLineItem } from '@/lib/orders/build-order'
import { fulfillmentLabel, statusLabel } from '@/lib/orders/labels'
import { parseShipment } from '@/lib/orders/shipment'

/** Square's literal order state (DRAFT/OPEN/COMPLETED/CANCELED) from raw, or null. */
function squareState(raw: unknown): string | null {
  // biome-ignore lint/suspicious/noExplicitAny: stored Square order snapshot is loose
  const state = (raw as any)?.state
  return typeof state === 'string' && state.length > 0 ? state : null
}

/** $X.XX from integer cents. Mirrors the per-file helper used across order views. */
function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatDateTime(date: Date | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const th = 'py-2 px-3 font-medium'
const td = 'py-2 px-3 align-top'

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="grid grid-cols-[12rem_1fr] gap-2 py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-bone">{children}</span>
    </div>
  )
}

/**
 * Admin read-only order view. Shows the operational fields (Square ids, buyer
 * identity, payment, refund state, raw fulfillment) the customer-facing
 * OrderDetailView intentionally hides. Reuses statusLabel/fulfillmentLabel.
 */
export function OrderDetail({ order }: { order: Order }): JSX.Element {
  const lineItems = (order.lineItems as OrderLineItem[]) ?? []
  const refundedCents = order.refundedCents ?? 0
  const sqState = squareState(order.raw)
  const shipment = parseShipment(order.raw)

  return (
    <section>
      <p className="eyebrow">Admin</p>
      <h1 className="mt-2 font-display text-3xl tracking-wide text-bone sm:text-4xl">Order</h1>
      <p className="mt-1 text-sm text-muted">
        Order #: <code className="font-mono text-purple-soft">{order.squareOrderId}</code>
      </p>

      <div className="panel mt-6 max-w-2xl p-4">
        <Row label="Placed">{formatDateTime(order.placedAt)}</Row>
        <Row label="Status">{statusLabel(order.status)}</Row>
        <Row label="Square state">
          {sqState ? <code className="font-mono">{sqState}</code> : '—'}
        </Row>
        <Row label="Fulfillment">
          {fulfillmentLabel(order.fulfillmentState)}{' '}
          <code className="font-mono text-muted">
            ({order.fulfillmentState ? order.fulfillmentState : 'none'})
          </code>
        </Row>
        <Row label="Total">
          <span className="font-mono">{formatCents(order.totalCents)}</span>
        </Row>
        {refundedCents > 0 && (
          <Row label="Refunded">
            <span className="font-mono">
              {formatCents(refundedCents)} of {formatCents(order.totalCents)}
            </span>
          </Row>
        )}
        <Row label="Buyer email">{order.buyerEmail ?? '—'}</Row>
        <Row label="User id">
          {order.userId ? <code className="font-mono">{order.userId}</code> : '— (guest)'}
        </Row>
        <Row label="Square customer">
          {order.squareCustomerId ? (
            <code className="font-mono">{order.squareCustomerId}</code>
          ) : (
            '—'
          )}
        </Row>
        <Row label="Square payment">
          {order.squarePaymentId ? (
            <code className="font-mono">{order.squarePaymentId}</code>
          ) : (
            '— (no payment id)'
          )}
        </Row>
      </div>

      <h2 className="eyebrow mt-8 text-purple-soft">Shipment</h2>
      {shipment ? (
        <div className="panel mt-3 max-w-2xl p-4">
          {shipment.recipientName && <Row label="Recipient">{shipment.recipientName}</Row>}
          {shipment.addressLines.length > 0 && (
            <Row label="Address">
              {shipment.addressLines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </Row>
          )}
          {shipment.carrier && <Row label="Carrier">{shipment.carrier}</Row>}
          {shipment.shippingType && <Row label="Shipping type">{shipment.shippingType}</Row>}
          {shipment.trackingNumber && (
            <Row label="Tracking">
              {shipment.trackingUrl ? (
                <a
                  href={shipment.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-neon"
                >
                  <code className="font-mono">{shipment.trackingNumber}</code>
                </a>
              ) : (
                <code className="font-mono">{shipment.trackingNumber}</code>
              )}
            </Row>
          )}
          {shipment.shippedAt && (
            <Row label="Shipped">{formatDateTime(new Date(shipment.shippedAt))}</Row>
          )}
        </div>
      ) : (
        <p className="mt-3 text-muted">No shipment details.</p>
      )}

      {order.shipping && (
        <>
          <h2 className="eyebrow mt-8 text-purple-soft">Shipping (Shippo)</h2>
          <div className="panel mt-3 max-w-2xl p-4">
            <Row label="Ship to">
              <div>
                {order.shipping.address.firstName} {order.shipping.address.lastName}
              </div>
              <div>{order.shipping.address.line1}</div>
              {order.shipping.address.line2 && <div>{order.shipping.address.line2}</div>}
              <div>
                {order.shipping.address.city}
                {order.shipping.address.state ? `, ${order.shipping.address.state}` : ''}{' '}
                {order.shipping.address.zip}
              </div>
              <div>{order.shipping.address.country}</div>
              {order.shipping.address.phone && <div>{order.shipping.address.phone}</div>}
            </Row>
            {order.shipping.selection ? (
              <>
                <Row label="Chosen rate">
                  <span className="font-mono">
                    {order.shipping.selection.carrier} · {order.shipping.selection.service} ·{' '}
                    {formatCents(order.shipping.selection.amountCents)}
                  </span>
                </Row>
                <Row label="Shippo shipment">
                  {order.shipping.selection.shipmentId ? (
                    <code className="font-mono">{order.shipping.selection.shipmentId}</code>
                  ) : (
                    '—'
                  )}
                </Row>
                <Row label="Shippo rate">
                  {order.shipping.selection.rateId ? (
                    <code className="font-mono">{order.shipping.selection.rateId}</code>
                  ) : (
                    '—'
                  )}
                </Row>
              </>
            ) : (
              <Row label="Rate">
                {order.shipping.fallbackUsed ? 'Flat fallback fee (no live rate)' : 'Flat fee'}
              </Row>
            )}
          </div>
        </>
      )}

      <h2 className="eyebrow mt-8 text-purple-soft">Items</h2>
      <table className="mt-3 w-full max-w-2xl border-collapse text-sm">
        <thead>
          <tr className="border-b border-line-strong text-left text-muted">
            <th className={th}>Item</th>
            <th className={th}>Qty</th>
            <th className={th}>Unit</th>
            <th className={th}>Total</th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((item, i) => (
            <tr
              key={`${item.catalogObjectId ?? item.name}-${i}`}
              className="border-b border-line hover:bg-wall-2"
            >
              <td className={`${td} text-bone`}>
                {item.name}
                {item.variationName ? ` · ${item.variationName}` : ''}
              </td>
              <td className={`${td} text-muted`}>{item.quantity}</td>
              <td className={`${td} font-mono text-bone`}>{formatCents(item.unitPriceCents)}</td>
              <td className={`${td} font-mono text-bone`}>{formatCents(item.totalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
