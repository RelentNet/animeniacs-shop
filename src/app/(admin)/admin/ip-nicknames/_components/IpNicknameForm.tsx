'use client'

import type { IpNickname } from '@/lib/db/schema'
import { useFormState } from 'react-dom'
import type { SquareIpCategoryOption } from './SquareIpCategoryPicker'

export interface IpNicknameFormError {
  message: string
  fields?: Partial<Record<string, string>>
}

export type IpNicknameFormState = { error?: IpNicknameFormError } | undefined

export interface IpNicknameFormProps {
  action: (prev: IpNicknameFormState, form: FormData) => Promise<IpNicknameFormState>
  categoryOptions: SquareIpCategoryOption[]
  initial?: IpNickname
  mode: 'create' | 'edit'
}

export function IpNicknameForm({
  action,
  categoryOptions,
  initial,
  mode
}: IpNicknameFormProps): JSX.Element {
  const [state, formAction] = useFormState(action, undefined)
  const n = initial
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
        label="Slug"
        hint="Lowercase letters, digits, hyphen. Used in /category/<slug>."
        error={fieldErr('slug')}
      >
        <input
          type="text"
          name="slug"
          required
          maxLength={80}
          pattern="^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$"
          defaultValue={n?.slug}
          readOnly={mode === 'edit'}
        />
      </Field>

      <Field label="Nickname (public)" error={fieldErr('nickname')}>
        <input type="text" name="nickname" required maxLength={120} defaultValue={n?.nickname} />
      </Field>

      <Field
        label="Square category"
        error={fieldErr('squareCategoryId')}
        hint="Hierarchical label shows parent > child. Categories already mapped are hidden."
      >
        <select name="squareCategoryId" defaultValue={n?.squareCategoryId ?? ''} required>
          <option value="" disabled>
            Select a Square category…
          </option>
          {categoryOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
        {categoryOptions.length === 0 && (
          <small style={{ color: '#a33' }}>No unmapped non-artist categories available.</small>
        )}
      </Field>

      <Field label="Description" error={fieldErr('description')}>
        <textarea
          name="description"
          maxLength={2000}
          rows={4}
          defaultValue={n?.description ?? ''}
        />
      </Field>

      <Field label="Visibility">
        <span>
          <label style={{ marginRight: '1rem' }}>
            <input
              type="radio"
              name="isPublic"
              value="true"
              defaultChecked={(n?.isPublic ?? true) === true}
            />{' '}
            Public
          </label>
          <label>
            <input
              type="radio"
              name="isPublic"
              value="false"
              defaultChecked={n?.isPublic === false}
            />{' '}
            Hidden
          </label>
        </span>
      </Field>

      <button type="submit" style={{ justifySelf: 'start', padding: '0.5rem 1rem' }}>
        {mode === 'create' ? 'Create nickname' : 'Save changes'}
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
