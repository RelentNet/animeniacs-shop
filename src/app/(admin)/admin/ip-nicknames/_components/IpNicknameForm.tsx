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

const fieldClass =
  'bg-ink-2 border border-line text-bone rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neon/60'

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
    <form action={formAction} method="post" className="grid max-w-2xl gap-3">
      {err?.message && (
        <div role="alert" className="alert alert-error">
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
          className={fieldClass}
        />
      </Field>

      <Field label="Nickname (public)" error={fieldErr('nickname')}>
        <input
          type="text"
          name="nickname"
          required
          maxLength={120}
          defaultValue={n?.nickname}
          className={fieldClass}
        />
      </Field>

      <Field
        label="Square category"
        error={fieldErr('squareCategoryId')}
        hint="Hierarchical label shows parent > child. Categories already mapped are hidden."
      >
        <select
          name="squareCategoryId"
          defaultValue={n?.squareCategoryId ?? ''}
          required
          className={fieldClass}
        >
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
          <small className="text-red-400">No unmapped non-artist categories available.</small>
        )}
      </Field>

      <Field label="Description" error={fieldErr('description')}>
        <textarea
          name="description"
          maxLength={2000}
          rows={4}
          defaultValue={n?.description ?? ''}
          className={fieldClass}
        />
      </Field>

      <Field label="Visibility">
        <span className="flex items-center gap-4 text-sm text-bone">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="isPublic"
              value="true"
              defaultChecked={(n?.isPublic ?? true) === true}
            />
            Public
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="isPublic"
              value="false"
              defaultChecked={n?.isPublic === false}
            />
            Hidden
          </label>
        </span>
      </Field>

      <button type="submit" className="btn-neon justify-self-start">
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
