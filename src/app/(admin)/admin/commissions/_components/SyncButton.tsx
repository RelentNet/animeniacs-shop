'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { type SyncState, syncCommissionsAction } from '../actions'

function SubmitButton(): JSX.Element {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-neon">
      {pending ? 'Syncing from Square…' : 'Sync from Square'}
    </button>
  )
}

/** Runs the commission recompute and shows the result inline. */
export function SyncButton(): JSX.Element {
  const [state, formAction] = useFormState<SyncState, FormData>(
    (prev) => syncCommissionsAction(prev),
    {}
  )
  return (
    <form action={formAction} className="flex items-center gap-3">
      <SubmitButton />
      {state.ok && <span className="text-sm text-neon-soft">{state.ok}</span>}
      {state.error && <span className="text-sm text-red-400">{state.error}</span>}
    </form>
  )
}
