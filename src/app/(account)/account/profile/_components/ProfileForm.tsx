'use client'

import type { Artist } from '@/lib/db/schema'
import { useFormState } from 'react-dom'
import { type ProfileFormState, updateOwnProfileAction } from '../actions'

const PAYMENT_METHODS = ['paypal', 'venmo', 'check', 'zelle', 'other'] as const

const fieldClass =
  'bg-ink-2 border border-line text-bone rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neon/60'

const SOCIALS = [
  ['instagram', 'Instagram'],
  ['twitter', 'Twitter / X'],
  ['facebook', 'Facebook'],
  ['youtube', 'YouTube'],
  ['tiktok', 'TikTok'],
  ['website', 'Website']
] as const

export function ProfileForm({ artist }: { artist: Artist }): JSX.Element {
  const [state, formAction] = useFormState<ProfileFormState, FormData>(updateOwnProfileAction, {})
  const fe = (n: string) => state.fields?.[n]

  return (
    <form action={formAction} encType="multipart/form-data" className="grid max-w-2xl gap-3">
      {state.error && (
        <div role="alert" className="alert alert-error">
          {state.error}
        </div>
      )}
      {state.ok && (
        <output className="block rounded-md border border-neon/40 bg-neon/10 p-3 text-sm text-bone">
          {state.ok}
        </output>
      )}

      <Field
        label="Avatar"
        hint={
          artist.avatarUrl
            ? `Currently: ${artist.avatarUrl}. Upload a new file to replace.`
            : 'PNG/JPEG/WebP, max 2 MB. Resized to 500x500 webp on save.'
        }
        error={fe('avatarFile')}
      >
        <input
          type="file"
          name="avatarFile"
          accept="image/png,image/jpeg,image/webp"
          className="text-sm text-muted"
        />
      </Field>

      <Field label="Bio" error={fe('bio')}>
        <textarea
          name="bio"
          maxLength={2000}
          rows={4}
          defaultValue={artist.bio ?? ''}
          className={fieldClass}
        />
      </Field>

      <fieldset className="grid gap-3 rounded-md border border-line p-3">
        <legend className="eyebrow px-1 text-purple-soft">Links (optional)</legend>
        {SOCIALS.map(([name, label]) => (
          <Field key={name} label={label} error={fe(name)}>
            <input
              type="url"
              name={name}
              defaultValue={artist[name] ?? ''}
              className={fieldClass}
            />
          </Field>
        ))}
      </fieldset>

      <fieldset className="grid gap-3 rounded-md border border-line p-3">
        <legend className="eyebrow px-1 text-purple-soft">Payout details</legend>
        <p className="text-xs text-muted">
          Changing these alerts the shop and emails you a confirmation. If it wasn’t you, contact
          us.
        </p>
        <Field label="Payment method" error={fe('paymentMethod')}>
          <select
            name="paymentMethod"
            defaultValue={artist.paymentMethod ?? ''}
            className={fieldClass}
          >
            <option value="">— None —</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Payment email / handle" error={fe('paymentEmail')}>
          <input
            type="text"
            name="paymentEmail"
            maxLength={200}
            defaultValue={artist.paymentEmail ?? ''}
            className={fieldClass}
          />
        </Field>
      </fieldset>

      <button type="submit" className="btn-neon justify-self-start">
        Save profile
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
