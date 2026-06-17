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
  'mt-1 block w-full rounded-md border border-line bg-wall-2 px-3 py-2 text-sm text-bone placeholder:text-faint focus:border-neon focus:outline-none'

export function SavedAddresses({ addresses }: { addresses: SavedAddress[] }): JSX.Element {
  const [state, formAction] = useFormState<AddressFormState, FormData>(addAddressAction, {})

  return (
    <div className="mt-4 max-w-md">
      {addresses.length === 0 ? (
        <p className="text-sm text-muted">You don’t have any saved addresses yet.</p>
      ) : (
        <ul className="space-y-3">
          {addresses.map((a) => (
            <li
              key={a.id}
              className="rounded-md border border-line bg-wall-2 p-3 text-sm text-muted"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-bone">{a.label}</span>
                {a.isDefault ? <span className="sticker">Default</span> : null}
              </div>
              <p className="mt-1 text-muted">
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
              <div className="mt-3 flex gap-4">
                {a.isDefault ? null : (
                  <form action={setDefaultAddressAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <button
                      type="submit"
                      className="text-neon-soft transition-colors hover:text-neon hover:no-underline"
                    >
                      Make default
                    </button>
                  </form>
                )}
                <form action={deleteAddressAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <button
                    type="submit"
                    className="text-muted transition-colors hover:text-red-400 hover:no-underline"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="mt-6 space-y-4">
        <h3 className="eyebrow text-purple-soft">Add an address</h3>
        {state.error ? (
          <p
            role="alert"
            className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          >
            {state.error}
          </p>
        ) : null}
        {state.saved ? (
          <output className="block rounded-md border border-neon/40 bg-neon/10 px-3 py-2 text-sm text-neon-soft">
            Address saved.
          </output>
        ) : null}

        <div>
          <label htmlFor="label" className="text-sm font-medium text-bone">
            Label <span className="text-faint">(optional)</span>
          </label>
          <input id="label" name="label" placeholder="Home" className={INPUT_CLASS} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className="text-sm font-medium text-bone">
              First name
            </label>
            <input
              id="firstName"
              name="firstName"
              autoComplete="given-name"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="lastName" className="text-sm font-medium text-bone">
              Last name
            </label>
            <input
              id="lastName"
              name="lastName"
              autoComplete="family-name"
              className={INPUT_CLASS}
            />
          </div>
        </div>

        <div>
          <label htmlFor="line1" className="text-sm font-medium text-bone">
            Street address
          </label>
          <input id="line1" name="line1" autoComplete="address-line1" className={INPUT_CLASS} />
        </div>

        <div>
          <label htmlFor="line2" className="text-sm font-medium text-bone">
            Apartment, suite, etc. <span className="text-faint">(optional)</span>
          </label>
          <input id="line2" name="line2" autoComplete="address-line2" className={INPUT_CLASS} />
        </div>

        <div>
          <label htmlFor="city" className="text-sm font-medium text-bone">
            City
          </label>
          <input id="city" name="city" autoComplete="address-level2" className={INPUT_CLASS} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="state" className="text-sm font-medium text-bone">
              State
            </label>
            <input id="state" name="state" autoComplete="address-level1" className={INPUT_CLASS} />
          </div>
          <div>
            <label htmlFor="zip" className="text-sm font-medium text-bone">
              ZIP
            </label>
            <input id="zip" name="zip" autoComplete="postal-code" className={INPUT_CLASS} />
          </div>
        </div>

        <div>
          <label htmlFor="phone" className="text-sm font-medium text-bone">
            Phone <span className="text-faint">(optional)</span>
          </label>
          <input id="phone" name="phone" autoComplete="tel" className={INPUT_CLASS} />
        </div>

        <label className="flex items-center gap-2 text-sm text-bone">
          <input type="checkbox" name="isDefault" className="accent-neon" />
          Make this my default address
        </label>

        <button type="submit" className="btn-neon">
          Save address
        </button>
      </form>
    </div>
  )
}
