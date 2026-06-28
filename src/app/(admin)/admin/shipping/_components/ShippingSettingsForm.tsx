'use client'

import type { ShippingSettings } from '@/lib/db/queries/shipping-settings'
import { useFormState } from 'react-dom'

export interface ShippingFormError {
  message: string
  fields?: Partial<Record<string, string>>
}

export type ShippingFormState = { error?: ShippingFormError; saved?: boolean } | undefined

export interface ShippingSettingsFormProps {
  action: (prev: ShippingFormState, form: FormData) => Promise<ShippingFormState>
  initial: ShippingSettings
}

const dollars = (cents: number): string => (cents / 100).toFixed(2)

export function ShippingSettingsForm({ action, initial }: ShippingSettingsFormProps): JSX.Element {
  const [state, formAction] = useFormState(action, undefined)
  const v = initial
  const sf = v.shipFrom
  const pkg = v.packagingFeesCents
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

      <h3 style={{ margin: '0.5rem 0 0', fontSize: '1rem' }}>Ship-from origin</h3>
      <small style={{ color: '#666', marginTop: '-0.5rem' }}>
        The address Shippo rates from. Must be a real, deliverable origin before going live.
      </small>
      <Field label="Name / Company" error={fieldErr('shipFrom')}>
        <input type="text" name="sf_name" defaultValue={sf.name} />
      </Field>
      <Field label="Street address">
        <input type="text" name="sf_street1" defaultValue={sf.street1} />
      </Field>
      <Field label="Street address 2 (optional)">
        <input type="text" name="sf_street2" defaultValue={sf.street2 ?? ''} />
      </Field>
      <Field label="City">
        <input type="text" name="sf_city" defaultValue={sf.city} />
      </Field>
      <Field label="State / Province">
        <input type="text" name="sf_state" defaultValue={sf.state ?? ''} />
      </Field>
      <Field label="ZIP / Postal code">
        <input type="text" name="sf_zip" defaultValue={sf.zip} />
      </Field>
      <Field label="Country (2-letter ISO)" hint="e.g. US">
        <input type="text" name="sf_country" maxLength={2} defaultValue={sf.country} />
      </Field>
      <Field label="Phone (optional)">
        <input type="text" name="sf_phone" defaultValue={sf.phone ?? ''} />
      </Field>
      <Field label="Email (optional)">
        <input type="text" name="sf_email" defaultValue={sf.email ?? ''} />
      </Field>

      <h3 style={{ margin: '0.75rem 0 0', fontSize: '1rem' }}>Fees &amp; markup</h3>
      <Field
        label="Decal flat fee ($)"
        error={fieldErr('decalFlatCents')}
        hint="Flat shipping for decals / stickers / posters (not box-rated)."
      >
        <input type="text" inputMode="decimal" name="decalFlatDollars" defaultValue={dollars(v.decalFlatCents)} />
      </Field>
      <Field
        label="Fallback flat fee ($)"
        error={fieldErr('fallbackFlatCents')}
        hint="Charged when live rating fails or returns no rates."
      >
        <input
          type="text"
          inputMode="decimal"
          name="fallbackFlatDollars"
          defaultValue={dollars(v.fallbackFlatCents)}
        />
      </Field>
      <Field
        label="Carrier markup (%)"
        error={fieldErr('markupPercent')}
        hint="Added on top of each live carrier rate. 0 = none."
      >
        <input type="text" inputMode="decimal" name="markupPercent" defaultValue={String(v.markupPercent)} />
      </Field>

      <h3 style={{ margin: '0.75rem 0 0', fontSize: '1rem' }}>Packaging fees (per box)</h3>
      <small style={{ color: '#666', marginTop: '-0.5rem' }}>
        Flat material/handling fee added on top of the carrier label, charged once per physical box
        used (a 2-acrylic order pays the single-acrylic fee twice). 0 = none.
      </small>
      <Field
        label="Single acrylic box ($)"
        error={fieldErr('packagingFeesCents')}
        hint="22×20×2 in — one acrylic."
      >
        <input type="text" inputMode="decimal" name="pkg_single_acrylic" defaultValue={dollars(pkg.single_acrylic)} />
      </Field>
      <Field label="Frame box ($)" hint="30×20×2.5 in — one frame + up to 2 acrylics.">
        <input type="text" inputMode="decimal" name="pkg_frame" defaultValue={dollars(pkg.frame)} />
      </Field>
      <Field label="3-frame box ($)" hint="30×20×7.5 in — three frames.">
        <input type="text" inputMode="decimal" name="pkg_3_frames" defaultValue={dollars(pkg['3_frames'])} />
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
