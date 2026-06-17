'use client'

import { OrderDetailView } from '@/components/orders/OrderDetailView'
import { useFormState } from 'react-dom'
import { type LookupState, lookupOrderAction } from './actions'

const INPUT_CLASS =
  'mt-1 block w-full rounded-md border border-line bg-wall-2 px-3 py-2 text-sm text-bone placeholder:text-faint focus:border-neon focus:outline-none'

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
    <form action={formAction} className="mt-6 max-w-md space-y-4">
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {state.error}
        </p>
      ) : null}

      <div>
        <label htmlFor="email" className="text-sm font-medium text-bone">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label htmlFor="orderNumber" className="text-sm font-medium text-bone">
          Order number
        </label>
        <input
          id="orderNumber"
          name="orderNumber"
          required
          className={INPUT_CLASS}
          placeholder="The order number from your confirmation"
        />
      </div>

      <button type="submit" className="btn-neon">
        Find my order
      </button>
    </form>
  )
}
