'use client'

import type { PromoBarValue } from '@/lib/db/queries/site-settings'
import { useFormState } from 'react-dom'

export interface PromoBarFormError {
  message: string
  fields?: Partial<Record<string, string>>
}

export type PromoBarFormState = { error?: PromoBarFormError; saved?: boolean } | undefined

export interface PromoBarSettingsFormProps {
  action: (prev: PromoBarFormState, form: FormData) => Promise<PromoBarFormState>
  initial?: PromoBarValue | null
}

export function PromoBarSettingsForm({ action, initial }: PromoBarSettingsFormProps): JSX.Element {
  const [state, formAction] = useFormState(action, undefined)
  const v = initial
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
      {state?.saved && !err && (
        <output style={{ display: 'block', background: '#dfd', padding: '0.5rem' }}>Saved.</output>
      )}

      <Field label="Enabled" hint="When off, the bar is hidden on the storefront.">
        <label>
          <input type="checkbox" name="enabled" defaultChecked={v?.enabled ?? false} /> Show promo
          bar
        </label>
      </Field>

      <Field label="Text" error={fieldErr('text')} hint="Up to 200 characters.">
        <input type="text" name="text" maxLength={200} defaultValue={v?.text ?? ''} />
      </Field>

      <Field
        label="Link (optional)"
        error={fieldErr('link')}
        hint="Full URL, e.g. https://… Leave blank for no link."
      >
        <input type="text" name="link" defaultValue={v?.link ?? ''} />
      </Field>

      <Field label="Background color" error={fieldErr('bgColor')} hint="Hex, e.g. #1a1a2e">
        <input type="text" name="bgColor" defaultValue={v?.bgColor ?? '#1a1a2e'} />
      </Field>

      <Field label="Text color" error={fieldErr('textColor')} hint="Hex, e.g. #ffffff">
        <input type="text" name="textColor" defaultValue={v?.textColor ?? '#ffffff'} />
      </Field>

      <button type="submit" style={{ justifySelf: 'start', padding: '0.5rem 1rem' }}>
        Save
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
