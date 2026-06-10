'use client'

import { useFormState } from 'react-dom'
import { type AddressFormState, saveAddressAction } from './actions'

export interface AddressFormInitial {
  addressLine1?: string
  addressLine2?: string
  locality?: string
  administrativeDistrictLevel1?: string
  postalCode?: string
  country?: string
}

const INPUT_CLASS =
  'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900'

export function AddressForm({ initial }: { initial: AddressFormInitial }): JSX.Element {
  const [state, formAction] = useFormState<AddressFormState, FormData>(saveAddressAction, {})

  return (
    <form action={formAction} className="mt-4 max-w-md space-y-4">
      {state.error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <output className="block rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          Address saved.
        </output>
      ) : null}

      <div>
        <label htmlFor="addressLine1" className="text-sm font-medium text-gray-900">
          Street address
        </label>
        <input
          id="addressLine1"
          name="addressLine1"
          defaultValue={initial.addressLine1 ?? ''}
          autoComplete="address-line1"
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label htmlFor="addressLine2" className="text-sm font-medium text-gray-900">
          Apartment, suite, etc. <span className="text-gray-400">(optional)</span>
        </label>
        <input
          id="addressLine2"
          name="addressLine2"
          defaultValue={initial.addressLine2 ?? ''}
          autoComplete="address-line2"
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label htmlFor="locality" className="text-sm font-medium text-gray-900">
          City
        </label>
        <input
          id="locality"
          name="locality"
          defaultValue={initial.locality ?? ''}
          autoComplete="address-level2"
          className={INPUT_CLASS}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="administrativeDistrictLevel1"
            className="text-sm font-medium text-gray-900"
          >
            State
          </label>
          <input
            id="administrativeDistrictLevel1"
            name="administrativeDistrictLevel1"
            defaultValue={initial.administrativeDistrictLevel1 ?? ''}
            autoComplete="address-level1"
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="postalCode" className="text-sm font-medium text-gray-900">
            Postal code
          </label>
          <input
            id="postalCode"
            name="postalCode"
            defaultValue={initial.postalCode ?? ''}
            autoComplete="postal-code"
            className={INPUT_CLASS}
          />
        </div>
      </div>

      <div>
        <label htmlFor="country" className="text-sm font-medium text-gray-900">
          Country
        </label>
        <input
          id="country"
          name="country"
          defaultValue={initial.country ?? 'US'}
          autoComplete="country"
          className={INPUT_CLASS}
        />
      </div>

      <button
        type="submit"
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
      >
        Save address
      </button>
    </form>
  )
}
