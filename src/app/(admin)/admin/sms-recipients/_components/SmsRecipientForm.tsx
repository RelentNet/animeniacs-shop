'use client'

import type { SmsRecipient } from '@/lib/db/schema'
import { useFormState } from 'react-dom'

export interface SmsRecipientFormError {
  message: string
  fields?: Partial<Record<string, string>>
}

export type SmsRecipientFormState = { error?: SmsRecipientFormError } | undefined

export interface SmsRecipientFormProps {
  action: (prev: SmsRecipientFormState, form: FormData) => Promise<SmsRecipientFormState>
  initial?: SmsRecipient
  mode: 'create' | 'edit'
}

const fieldClass =
  'bg-ink-2 border border-line text-bone rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neon/60'

export function SmsRecipientForm({ action, initial, mode }: SmsRecipientFormProps): JSX.Element {
  const [state, formAction] = useFormState(action, undefined)
  const r = initial
  const err = state?.error
  const fieldErr = (name: string) => err?.fields?.[name]

  return (
    <form action={formAction} method="post" className="grid max-w-2xl gap-3">
      {err?.message && (
        <div role="alert" className="alert alert-error">
          {err.message}
        </div>
      )}

      <Field
        label="Phone (E.164)"
        hint="Must start with + and country code, e.g. +14155552671."
        error={fieldErr('phone')}
      >
        <input
          type="tel"
          name="phone"
          required
          maxLength={16}
          pattern="^\+[1-9]\d{1,14}$"
          defaultValue={r?.phone}
          readOnly={mode === 'edit'}
          className={fieldClass}
        />
      </Field>

      <Field label="Label" hint="Optional: e.g. Owner, Manager." error={fieldErr('label')}>
        <input
          type="text"
          name="label"
          maxLength={60}
          defaultValue={r?.label ?? ''}
          className={fieldClass}
        />
      </Field>

      <Field label="Status">
        <span className="flex items-center gap-4 text-sm text-bone">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="enabled"
              value="true"
              defaultChecked={(r?.enabled ?? true) === true}
            />
            Enabled
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="enabled"
              value="false"
              defaultChecked={r?.enabled === false}
            />
            Disabled
          </label>
        </span>
      </Field>

      <button type="submit" className="btn-neon justify-self-start">
        {mode === 'create' ? 'Create recipient' : 'Save changes'}
      </button>
    </form>
  )
}

function Field({
  label,
  hint,
  error,
  children
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="grid gap-1">
      <span className="field-label">{label}</span>
      {children}
      {hint && <small className="text-muted">{hint}</small>}
      {error && (
        <span role="alert" className="text-sm text-red-400">
          {error}
        </span>
      )}
    </div>
  )
}
