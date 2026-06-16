'use client'

import type { OrderActionState } from '@/app/(admin)/admin/orders/[id]/actions'
import {
  ADMIN_TARGET_STATES,
  type FulfillmentState,
  isAllowedTransition
} from '@/lib/orders/fulfillment-states'
import { useFormState } from 'react-dom'

export interface FulfillmentPanelProps {
  /** Current raw Square fulfillment state (null when none recorded). */
  fulfillmentState: string | null
  action: (prev: OrderActionState, form: FormData) => Promise<OrderActionState>
}

/**
 * Advance the order's fulfillment state in Square. The select offers only the
 * forward targets allowed from the current state (plus CANCELED). When the
 * current state is terminal there are no valid moves and the control is
 * disabled. Surfaces the NO_FULFILLMENT error from the action inline so the
 * operator knows to advance it once in Square.
 */
export function FulfillmentPanel({ fulfillmentState, action }: FulfillmentPanelProps): JSX.Element {
  const [state, formAction] = useFormState(action, undefined)

  const current = fulfillmentState ?? 'PROPOSED'
  const targets = ADMIN_TARGET_STATES.filter((t) => isAllowedTransition(current, t))
  const hasMoves = targets.length > 0

  return (
    <section
      style={{
        border: '1px solid #ddd',
        borderRadius: '0.5rem',
        padding: '1rem',
        marginTop: '1.5rem'
      }}
    >
      <h2 style={{ marginTop: 0 }}>Fulfillment</h2>
      <p style={{ marginTop: 0, color: '#555' }}>
        Current: <code>{fulfillmentState ?? 'none'}</code>
      </p>

      {state && 'ok' in state && (
        <output
          style={{
            display: 'block',
            background: '#dfd',
            padding: '0.5rem',
            marginBottom: '0.5rem'
          }}
        >
          Fulfillment update submitted. Square will reconcile shortly.
        </output>
      )}
      {state && 'error' in state && (
        <div role="alert" style={{ background: '#fee', padding: '0.5rem', marginBottom: '0.5rem' }}>
          {state.error}
        </div>
      )}

      {!hasMoves ? (
        <p style={{ color: '#a33' }}>
          No further fulfillment moves are available from <code>{current}</code>.
        </p>
      ) : (
        <form
          action={formAction}
          style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}
        >
          <label style={{ display: 'grid', gap: '0.25rem' }}>
            <span>Advance to</span>
            <select name="toState" defaultValue={targets[0]}>
              {targets.map((t: FulfillmentState) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" style={{ padding: '0.5rem 1rem' }}>
            Push to Square
          </button>
        </form>
      )}
    </section>
  )
}
