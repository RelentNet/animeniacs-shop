'use client'

import { OrderDetailView } from '@/components/orders/OrderDetailView'
import { useFormState } from 'react-dom'
import { type LookupState, lookupOrderAction } from './actions'

const INPUT_CLASS =
  'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900'

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
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <div>
        <label htmlFor="email" className="text-sm font-medium text-gray-900">
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
        <label htmlFor="orderNumber" className="text-sm font-medium text-gray-900">
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

      <button
        type="submit"
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
      >
        Find my order
      </button>
    </form>
  )
}
