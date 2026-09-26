'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { type PayoutState, recordPayoutAction } from '../actions'

export interface PayoutFormArtist {
  id: string
  name: string
}

const fieldClass =
  'bg-ink-2 border border-line text-bone rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neon/60'

function Submit(): JSX.Element {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-neon">
      {pending ? 'Recording…' : 'Record payout'}
    </button>
  )
}

/** Record-a-payout form: artist, amount ($), date, method, note. */
export function PayoutForm({ artists }: { artists: PayoutFormArtist[] }): JSX.Element {
  const [state, action] = useFormState<PayoutState, FormData>(recordPayoutAction, {})
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <select name="artistId" required className={fieldClass} defaultValue="">
        <option value="" disabled>
          Select artist…
        </option>
        {artists.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <input
        name="amount"
        type="number"
        step="0.01"
        min="0.01"
        placeholder="Amount $"
        required
        className={`${fieldClass} w-28`}
      />
      <input name="paidAt" type="date" aria-label="Paid date" className={fieldClass} />
      <input
        name="method"
        type="text"
        placeholder="Method (cash, Venmo…)"
        className={`${fieldClass} w-40`}
      />
      <input
        name="note"
        type="text"
        placeholder="Note (optional)"
        className={`${fieldClass} w-52`}
      />
      <Submit />
      {state.ok && <span className="text-sm text-neon-soft">{state.ok}</span>}
      {state.error && <span className="text-sm text-red-400">{state.error}</span>}
    </form>
  )
}
