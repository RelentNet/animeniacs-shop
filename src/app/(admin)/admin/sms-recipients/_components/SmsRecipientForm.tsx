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

export function SmsRecipientForm({ action, initial, mode }: SmsRecipientFormProps): JSX.Element {
  const [state, formAction] = useFormState(action, undefined)
  const r = initial
  const err = state?.error
  const fieldErr = (name: string) => err?.fields?.[name]

  return (
    <form
      action={formAction}
      method="post"
      style={{ display: 'grid', gap: '0.75rem', maxWidth: '40rem' }}
    >
      {err?.message && (
        <div role="alert" style={{ background: '#fee', padding: '0.5rem' }}>
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
        />
      </Field>

      <Field label="Label" hint="Optional: e.g. Owner, Manager." error={fieldErr('label')}>
        <input type="text" name="label" maxLength={60} defaultValue={r?.label ?? ''} />
      </Field>

      <Field label="Status">
        <span>
          <label style={{ marginRight: '1rem' }}>
            <input
              type="radio"
              name="enabled"
              value="true"
              defaultChecked={(r?.enabled ?? true) === true}
            />{' '}
            Enabled
          </label>
          <label>
            <input
              type="radio"
              name="enabled"
              value="false"
              defaultChecked={r?.enabled === false}
            />{' '}
            Disabled
          </label>
        </span>
      </Field>

      <button type="submit" style={{ justifySelf: 'start', padding: '0.5rem 1rem' }}>
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
    <div style={{ display: 'grid', gap: '0.25rem' }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {children}
      {hint && <small style={{ color: '#666' }}>{hint}</small>}
      {error && (
        <span role="alert" style={{ color: '#a33', fontSize: '0.85em' }}>
          {error}
        </span>
      )}
    </div>
  )
}
