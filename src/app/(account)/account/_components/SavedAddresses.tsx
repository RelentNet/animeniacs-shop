'use client'

import type { SavedAddress } from '@/lib/db/schema'
import { useFormState } from 'react-dom'
import {
  type AddressFormState,
  addAddressAction,
  deleteAddressAction,
  setDefaultAddressAction
} from './actions'

const INPUT_CLASS =
  'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900'

export function SavedAddresses({ addresses }: { addresses: SavedAddress[] }): JSX.Element {
  const [state, formAction] = useFormState<AddressFormState, FormData>(addAddressAction, {})

  return (
    <div className="mt-4 max-w-md">
      {addresses.length === 0 ? (
        <p className="text-sm text-gray-600">You don’t have any saved addresses yet.</p>
      ) : (
        <ul className="space-y-3">
          {addresses.map((a) => (
            <li key={a.id} className="rounded-md border border-gray-200 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">{a.label}</span>
                {a.isDefault ? (
                  <span className="rounded bg-gray-900 px-2 py-0.5 text-xs font-medium text-white">
                    Default
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-gray-700">
                {a.address.firstName} {a.address.lastName}
                <br />
                {a.address.line1}
                {a.address.line2 ? (
                  <>
                    <br />
                    {a.address.line2}
                  </>
                ) : null}
                <br />
                {a.address.city}, {a.address.state} {a.address.zip}
              </p>
              <div className="mt-2 flex gap-3">
                {a.isDefault ? null : (
                  <form action={setDefaultAddressAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit" className="text-gray-700 underline hover:no-underline">
                      Make default
                    </button>
                  </form>
                )}
                <form action={deleteAddressAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit" className="text-red-700 underline hover:no-underline">
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="mt-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Add an address</h3>
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
          <label htmlFor="label" className="text-sm font-medium text-gray-900">
            Label <span className="text-gray-400">(optional)</span>
          </label>
          <input id="label" name="label" placeholder="Home" className={INPUT_CLASS} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className="text-sm font-medium text-gray-900">
              First name
            </label>
            <input id="firstName" name="firstName" autoComplete="given-name" className={INPUT_CLASS} />
          </div>
          <div>
            <label htmlFor="lastName" className="text-sm font-medium text-gray-900">
              Last name
            </label>
            <input id="lastName" name="lastName" autoComplete="family-name" className={INPUT_CLASS} />
          </div>
        </div>

        <div>
          <label htmlFor="line1" className="text-sm font-medium text-gray-900">
            Street address
          </label>
          <input id="line1" name="line1" autoComplete="address-line1" className={INPUT_CLASS} />
        </div>

        <div>
          <label htmlFor="line2" className="text-sm font-medium text-gray-900">
            Apartment, suite, etc. <span className="text-gray-400">(optional)</span>
          </label>
          <input id="line2" name="line2" autoComplete="address-line2" className={INPUT_CLASS} />
        </div>

        <div>
          <label htmlFor="city" className="text-sm font-medium text-gray-900">
            City
          </label>
          <input id="city" name="city" autoComplete="address-level2" className={INPUT_CLASS} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="state" className="text-sm font-medium text-gray-900">
              State
            </label>
            <input id="state" name="state" autoComplete="address-level1" className={INPUT_CLASS} />
          </div>
          <div>
            <label htmlFor="zip" className="text-sm font-medium text-gray-900">
              ZIP
            </label>
            <input id="zip" name="zip" autoComplete="postal-code" className={INPUT_CLASS} />
          </div>
        </div>

        <div>
          <label htmlFor="phone" className="text-sm font-medium text-gray-900">
            Phone <span className="text-gray-400">(optional)</span>
          </label>
          <input id="phone" name="phone" autoComplete="tel" className={INPUT_CLASS} />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-900">
          <input type="checkbox" name="isDefault" />
          Make this my default address
        </label>

        <button
          type="submit"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          Save address
        </button>
      </form>
    </div>
  )
}
