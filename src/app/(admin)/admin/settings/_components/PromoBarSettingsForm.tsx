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

const fieldClass =
  'bg-ink-2 border border-line text-bone rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neon/60'

export function PromoBarSettingsForm({ action, initial }: PromoBarSettingsFormProps): JSX.Element {
  const [state, formAction] = useFormState(action, undefined)
  const v = initial
  const err = state?.error
  const fieldErr = (name: string) => err?.fields?.[name]

  return (
    <form action={formAction} method="post" className="grid max-w-2xl gap-3">
      {err?.message && (
        <div role="alert" className="alert alert-error">
          {err.message}
        </div>
      )}
      {state?.saved && !err && <output className="alert alert-ok block">Saved.</output>}

      <Field label="Enabled" hint="When off, the bar is hidden on the storefront.">
        <label className="flex items-center gap-2 text-sm text-bone">
          <input type="checkbox" name="enabled" defaultChecked={v?.enabled ?? false} />
          Show promo bar
        </label>
      </Field>

      <Field label="Text" error={fieldErr('text')} hint="Up to 200 characters.">
        <input
          type="text"
          name="text"
          maxLength={200}
          defaultValue={v?.text ?? ''}
          className={fieldClass}
        />
      </Field>

      <Field
        label="Link (optional)"
        error={fieldErr('link')}
        hint="Full URL, e.g. https://… Leave blank for no link."
      >
        <input type="text" name="link" defaultValue={v?.link ?? ''} className={fieldClass} />
      </Field>

      <Field label="Background color" error={fieldErr('bgColor')} hint="Hex, e.g. #1a1a2e">
        <input
          type="text"
          name="bgColor"
          defaultValue={v?.bgColor ?? '#1a1a2e'}
          className={fieldClass}
        />
      </Field>

      <Field label="Text color" error={fieldErr('textColor')} hint="Hex, e.g. #ffffff">
        <input
          type="text"
          name="textColor"
          defaultValue={v?.textColor ?? '#ffffff'}
          className={fieldClass}
        />
      </Field>

      <button type="submit" className="btn-neon justify-self-start">
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
