'use client'

import { OrderDetailView } from '@/components/orders/OrderDetailView'
import { useFormState } from 'react-dom'
import { type LookupState, lookupOrderAction } from './actions'

export function LookupForm(): JSX.Element {
  const [state, formAction] = useFormState<LookupState, FormData>(lookupOrderAction, {})

  if (state.ok && state.order) {
    return (
      <div className="mt-6">
        <OrderDetailView order={state.order} />
      </div>
    )
  }

  return (
    <form action={formAction} className="panel mt-8 max-w-md space-y-5 p-6 md:p-7">
      {state.error ? (
        <p role="alert" className="alert alert-error">
          {state.error}
        </p>
      ) : null}

      <div>
        <label htmlFor="email" className="field-label">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="field-input mt-2"
        />
      </div>

      <div>
        <label htmlFor="orderNumber" className="field-label">
          Order number
        </label>
        <input
          id="orderNumber"
          name="orderNumber"
          required
          className="field-input mt-2"
          placeholder="The order number from your confirmation"
        />
      </div>

      <button type="submit" className="btn-neon w-full justify-center">
        Find my order
        <span aria-hidden="true">→</span>
      </button>
    </form>
  )
}
