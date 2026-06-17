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

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '12rem 1fr',
  gap: '0.5rem',
  padding: '0.35rem 0'
}
const labelStyle: React.CSSProperties = { color: '#555' }
const cellStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', verticalAlign: 'top' }

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <span>{children}</span>
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
      <h1 style={{ margin: 0 }}>Order</h1>
      <p style={{ marginTop: '0.25rem', color: '#555' }}>
        Order #: <code>{order.squareOrderId}</code>
      </p>

      <div style={{ marginTop: '1rem', maxWidth: '40rem' }}>
        <Row label="Placed">{formatDateTime(order.placedAt)}</Row>
        <Row label="Status">{statusLabel(order.status)}</Row>
        <Row label="Square state">{sqState ? <code>{sqState}</code> : '—'}</Row>
        <Row label="Fulfillment">
          {fulfillmentLabel(order.fulfillmentState)}
          {order.fulfillmentState ? <code> ({order.fulfillmentState})</code> : <code> (none)</code>}
        </Row>
        <Row label="Total">{formatCents(order.totalCents)}</Row>
        {refundedCents > 0 && (
          <Row label="Refunded">
            {formatCents(refundedCents)} of {formatCents(order.totalCents)}
          </Row>
        )}
        <Row label="Buyer email">{order.buyerEmail ?? '—'}</Row>
        <Row label="User id">{order.userId ? <code>{order.userId}</code> : '— (guest)'}</Row>
        <Row label="Square customer">
          {order.squareCustomerId ? <code>{order.squareCustomerId}</code> : '—'}
        </Row>
        <Row label="Square payment">
          {order.squarePaymentId ? <code>{order.squarePaymentId}</code> : '— (no payment id)'}
        </Row>
      </div>

      <h2 style={{ marginTop: '1.5rem' }}>Shipment</h2>
      {shipment ? (
        <div style={{ maxWidth: '40rem' }}>
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
                <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer">
                  <code>{shipment.trackingNumber}</code>
                </a>
              ) : (
                <code>{shipment.trackingNumber}</code>
              )}
            </Row>
          )}
          {shipment.shippedAt && (
            <Row label="Shipped">{formatDateTime(new Date(shipment.shippedAt))}</Row>
          )}
        </div>
      ) : (
        <p style={{ color: '#555' }}>No shipment details.</p>
      )}

      <h2 style={{ marginTop: '1.5rem' }}>Items</h2>
      <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: '40rem' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
            <th style={cellStyle}>Item</th>
            <th style={cellStyle}>Qty</th>
            <th style={cellStyle}>Unit</th>
            <th style={cellStyle}>Total</th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((item, i) => (
            <tr
              key={`${item.catalogObjectId ?? item.name}-${i}`}
              style={{ borderBottom: '1px solid #eee' }}
            >
              <td style={cellStyle}>
                {item.name}
                {item.variationName ? ` · ${item.variationName}` : ''}
              </td>
              <td style={cellStyle}>{item.quantity}</td>
              <td style={cellStyle}>{formatCents(item.unitPriceCents)}</td>
              <td style={cellStyle}>{formatCents(item.totalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
