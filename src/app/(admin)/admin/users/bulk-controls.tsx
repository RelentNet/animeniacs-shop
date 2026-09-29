'use client'

import { useEffect, useState } from 'react'

const SEL = 'input[name="ids"][form="bulk"]'

/** Header checkbox: toggles every selectable row on the page. */
export function SelectAll(): JSX.Element {
  return (
    <input
      type="checkbox"
      aria-label="Select all on page"
      onChange={(e) => {
        for (const c of document.querySelectorAll<HTMLInputElement>(SEL))
          c.checked = e.target.checked
        document.dispatchEvent(new Event('change'))
      }}
    />
  )
}

/** Bulk form (id="bulk"); row checkboxes join it via their `form` attribute. */
export function BulkBar({
  action,
  label,
  withReason
}: {
  action: (formData: FormData) => Promise<void>
  label: string
  withReason: boolean
}): JSX.Element {
  const [n, setN] = useState(0)
  useEffect(() => {
    const count = () => setN(document.querySelectorAll(`${SEL}:checked`).length)
    document.addEventListener('change', count)
    return () => document.removeEventListener('change', count)
  }, [])
  return (
    <form id="bulk" action={action} className="mt-4 flex flex-wrap items-center gap-3">
      {withReason && (
        <input
          type="text"
          name="reason"
          maxLength={500}
          placeholder="Reason for all selected (optional)"
          className="field-input w-72 py-1 text-sm"
        />
      )}
      <button
        type="submit"
        disabled={n === 0}
        className={`${withReason ? 'text-red-400 hover:text-red-300' : 'text-neon-soft hover:text-neon'} underline disabled:opacity-40`}
      >
        {label} ({n})
      </button>
    </form>
  )
}
