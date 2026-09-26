'use client'

import type { Artist } from '@/lib/db/schema'
import { useFormState } from 'react-dom'
import type { SquareCategoryOption } from './SquareCategoryPicker'

export interface ArtistFormError {
  /** Top-level message displayed at the top of the form. */
  message: string
  /** Per-field errors keyed by the form field name. */
  fields?: Partial<Record<string, string>>
}

export type ArtistFormState = { error?: ArtistFormError } | undefined

export interface ArtistFormProps {
  /** Server action wired to (prev, FormData) -> state. */
  action: (prev: ArtistFormState, form: FormData) => Promise<ArtistFormState>
  /** Square Artist > * sub-category options, pre-fetched server-side. */
  categoryOptions: SquareCategoryOption[]
  /** When editing, the current artist row to pre-populate fields with. */
  initial?: Artist
  /** Form mode — affects button label and a couple of validations. */
  mode: 'create' | 'edit'
}

const PAYMENT_METHODS = ['paypal', 'venmo', 'check', 'zelle', 'other'] as const

const fieldClass =
  'bg-ink-2 border border-line text-bone rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neon/60'

/**
 * Shared HTML form for both create and edit flows. Client component
 * so we can wire useFormState for inline server-action errors without
 * a full-page redirect on validation failure.
 *
 * No client-side form library — plain <input>s. HTML attrs handle the
 * obvious cases (required, pattern, min/max, accept); the server
 * action re-validates everything via ArtistInputSchema and any error
 * surfaces back through useFormState's `state` value.
 */
export function ArtistForm({
  action,
  categoryOptions,
  initial,
  mode
}: ArtistFormProps): JSX.Element {
  const [state, formAction] = useFormState(action, undefined)
  const a = initial
  const err = state?.error
  const fieldErr = (name: string) => err?.fields?.[name]

  return (
    <form
      action={formAction}
      method="post"
      encType="multipart/form-data"
      className="grid max-w-2xl gap-3"
    >
      {err?.message && (
        <div role="alert" className="alert alert-error">
          {err.message}
        </div>
      )}

      <Field
        label="Slug"
        hint="Lowercase, digits, dot, hyphen. Used in /artist/<slug>."
        error={fieldErr('slug')}
      >
        <input
          type="text"
          name="slug"
          required
          maxLength={80}
          pattern="^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$"
          defaultValue={a?.slug}
          readOnly={mode === 'edit'} // slug is identity; don't break old URLs
          className={fieldClass}
        />
      </Field>

      <Field label="Display name" error={fieldErr('displayName')}>
        <input
          type="text"
          name="displayName"
          required
          maxLength={120}
          defaultValue={a?.displayName}
          className={fieldClass}
        />
      </Field>

      <Field
        label="Square sub-category"
        error={fieldErr('squareCategoryId')}
        hint="Choose from existing Artist > * categories in Square. Add new ones in the Square dashboard."
      >
        <select
          name="squareCategoryId"
          defaultValue={a?.squareCategoryId ?? ''}
          required
          className={fieldClass}
        >
          <option value="" disabled>
            Select a sub-category...
          </option>
          {categoryOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.name}
            </option>
          ))}
        </select>
        {categoryOptions.length === 0 && (
          <small className="text-red-400">
            No Artist sub-categories found. Create one in the Square dashboard first.
          </small>
        )}
      </Field>

      <Field label="Status">
        <span className="flex items-center gap-4 text-sm text-bone">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="status"
              value="active"
              defaultChecked={(a?.status ?? 'active') === 'active'}
            />
            Active
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="status"
              value="inactive"
              defaultChecked={a?.status === 'inactive'}
            />
            Inactive
          </label>
        </span>
      </Field>

      <Field
        label="Avatar"
        hint={
          a?.avatarUrl
            ? `Currently: ${a.avatarUrl}. Upload a new file to replace.`
            : 'PNG/JPEG/WebP, max 2 MB. Resized to 500x500 webp on save.'
        }
        error={fieldErr('avatarFile')}
      >
        <input
          type="file"
          name="avatarFile"
          accept="image/png,image/jpeg,image/webp"
          className="text-sm text-muted"
        />
      </Field>

      <Field label="Bio" error={fieldErr('bio')}>
        <textarea
          name="bio"
          maxLength={2000}
          rows={4}
          defaultValue={a?.bio ?? ''}
          className={fieldClass}
        />
      </Field>

      <fieldset className="grid gap-3 rounded-md border border-line p-3">
        <legend className="eyebrow px-1 text-purple-soft">Social URLs (optional)</legend>
        <SocialField
          name="instagram"
          label="Instagram"
          defaultValue={a?.instagram}
          error={fieldErr('instagram')}
        />
        <SocialField
          name="twitter"
          label="Twitter / X"
          defaultValue={a?.twitter}
          error={fieldErr('twitter')}
        />
        <SocialField
          name="facebook"
          label="Facebook"
          defaultValue={a?.facebook}
          error={fieldErr('facebook')}
        />
        <SocialField
          name="youtube"
          label="YouTube"
          defaultValue={a?.youtube}
          error={fieldErr('youtube')}
        />
        <SocialField
          name="tiktok"
          label="TikTok"
          defaultValue={a?.tiktok}
          error={fieldErr('tiktok')}
        />
        <SocialField
          name="website"
          label="Website"
          defaultValue={a?.website}
          error={fieldErr('website')}
        />
      </fieldset>

      <Field
        label="Commission rate"
        hint="Decimal between 0 and 1 (e.g., 0.2 = 20%). Reference for the monthly Square dashboard report."
        error={fieldErr('commissionRate')}
      >
        <input
          type="number"
          name="commissionRate"
          step="0.0001"
          min="0"
          max="1"
          defaultValue={a?.commissionRate ?? '0.2000'}
          required
          className={fieldClass}
        />
      </Field>

      <Field label="Payment method" error={fieldErr('paymentMethod')}>
        <select name="paymentMethod" defaultValue={a?.paymentMethod ?? ''} className={fieldClass}>
          <option value="">— None —</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Payment email / handle" error={fieldErr('paymentEmail')}>
        <input
          type="text"
          name="paymentEmail"
          maxLength={200}
          defaultValue={a?.paymentEmail ?? ''}
          className={fieldClass}
        />
      </Field>

      <Field
        label="Account login email (self-serve earnings page)"
        error={fieldErr('accountEmail')}
      >
        <input
          type="email"
          name="accountEmail"
          maxLength={200}
          placeholder="the email they log in with"
          defaultValue={a?.accountEmail ?? ''}
          className={fieldClass}
        />
      </Field>

      <Field label="Admin notes (private)" error={fieldErr('notes')}>
        <textarea
          name="notes"
          maxLength={4000}
          rows={3}
          defaultValue={a?.notes ?? ''}
          className={fieldClass}
        />
      </Field>

      <button type="submit" className="btn-neon justify-self-start">
        {mode === 'create' ? 'Create artist' : 'Save changes'}
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

function SocialField({
  name,
  label,
  defaultValue,
  error
}: {
  name: string
  label: string
  defaultValue?: string | null
  error?: string
}): JSX.Element {
  const id = `social-${name}`
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input
        id={id}
        type="url"
        name={name}
        defaultValue={defaultValue ?? ''}
        className={fieldClass}
      />
      {error && (
        <span role="alert" className="text-sm text-red-400">
          {error}
        </span>
      )}
    </div>
  )
}
