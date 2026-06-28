import { ShippingSettingsSchema } from '@/lib/db/queries/shipping-settings'
import type { ShippingFormError } from './ShippingSettingsForm'

function fieldErrors(
  issues: { path: (string | number)[]; message: string }[]
): Record<string, string> {
  const fieldErrs: Record<string, string> = {}
  for (const issue of issues) {
    // Nested paths (e.g. shipFrom.zip, packagingFeesCents.frame) collapse to
    // their top-level group key so the form highlights the right section.
    const key = String(issue.path[0] ?? '')
    if (!key) continue
    fieldErrs[key] = fieldErrs[key] ? `${fieldErrs[key]}; ${issue.message}` : issue.message
  }
  return fieldErrs
}

export function validateShippingInput(
  raw: unknown
):
  | { ok: true; data: ReturnType<typeof ShippingSettingsSchema.parse> }
  | { ok: false; error: ShippingFormError } {
  const result = ShippingSettingsSchema.safeParse(raw)
  if (result.success) return { ok: true, data: result.data }
  return {
    ok: false,
    error: { message: 'Please correct the highlighted fields.', fields: fieldErrors(result.error.issues) }
  }
}
