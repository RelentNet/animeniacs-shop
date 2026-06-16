'use client'

import type { OrderActionState } from '@/app/(admin)/admin/orders/[id]/actions'
import type { Order } from '@/lib/db/schema'
import { useFormState } from 'react-dom'

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export interface RefundPanelProps {
  order: Order
  /** Bound server action: (prev, FormData) -> state (orderId baked in via .bind). */
  action: (prev: OrderActionState, form: FormData) => Promise<OrderActionState>
}

/**
 * Full-refund control. Refunds are full-only (operator decision). The panel is
 * disabled with an explanation when the order is not refundable: no Square
 * payment id, not completed, or already refunded. Requires a typed REFUND
 * confirmation + reason; surfaces Square errors inline.
 */
export function RefundPanel({ order, action }: RefundPanelProps): JSX.Element {
  const [state, formAction] = useFormState(action, undefined)

  const remaining = order.totalCents - (order.refundedCents ?? 0)
  const refundable =
    Boolean(order.squarePaymentId) &&
    order.status === 'completed' &&
    (order.refundedCents ?? 0) === 0 &&
    remaining > 0

  let blockedReason: string | null = null
  if (!order.squarePaymentId) blockedReason = 'No Square payment id on this order — cannot refund.'
  else if (order.status !== 'completed') blockedReason = `Order status is "${order.status}".`
  else if ((order.refundedCents ?? 0) !== 0) blockedReason = 'This order has already been refunded.'

  return (
    <section
      style={{
        border: '1px solid #ddd',
        borderRadius: '0.5rem',
        padding: '1rem',
        marginTop: '1.5rem'
      }}
    >
      <h2 style={{ marginTop: 0 }}>Refund</h2>

      {state && 'ok' in state && (
        <output
          style={{
            display: 'block',
            background: '#dfd',
            padding: '0.5rem',
            marginBottom: '0.5rem'
          }}
        >
          Refund submitted. The order will reflect the refunded state shortly.
        </output>
      )}
      {state && 'error' in state && (
        <div role="alert" style={{ background: '#fee', padding: '0.5rem', marginBottom: '0.5rem' }}>
          {state.error}
        </div>
      )}

      {!refundable ? (
        <p style={{ color: '#a33' }}>{blockedReason ?? 'This order is not refundable.'}</p>
      ) : (
        <form action={formAction} style={{ display: 'grid', gap: '0.75rem', maxWidth: '30rem' }}>
          <p style={{ margin: 0 }}>
            This issues a <strong>full refund</strong> of {formatCents(remaining)} against the
            Square payment. This cannot be undone here.
          </p>

          <label style={{ display: 'grid', gap: '0.25rem' }}>
            <span>Reason (required)</span>
            <textarea name="reason" required rows={2} maxLength={500} />
          </label>

          <label style={{ display: 'grid', gap: '0.25rem' }}>
            <span>
              Type <code>REFUND</code> to confirm
            </span>
            <input type="text" name="confirm" required autoComplete="off" pattern="REFUND" />
          </label>

          <button type="submit" style={{ justifySelf: 'start', padding: '0.5rem 1rem' }}>
            Issue full refund
          </button>
        </form>
      )}
    </section>
  )
}
