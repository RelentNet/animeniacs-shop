import { PromoBarValueSchema } from '@/lib/db/queries/site-settings'
import type { PromoBarFormError } from './PromoBarSettingsForm'

function fieldErrors(issues: { path: (string | number)[]; message: string }[]): Record<string, string> {
  const fieldErrs: Record<string, string> = {}
  for (const issue of issues) {
    // Nested paths (e.g. shipFrom.zip) collapse to their top-level group key.
    const key = String(issue.path[0] ?? '')
    if (!key) continue
    fieldErrs[key] = fieldErrs[key] ? `${fieldErrs[key]}; ${issue.message}` : issue.message
  }
  return fieldErrs
}

export function validatePromoBarInput(
  raw: unknown
):
  | { ok: true; data: ReturnType<typeof PromoBarValueSchema.parse> }
  | { ok: false; error: PromoBarFormError } {
  const result = PromoBarValueSchema.safeParse(raw)
  if (result.success) return { ok: true, data: result.data }
  return {
    ok: false,
    error: { message: 'Please correct the highlighted fields.', fields: fieldErrors(result.error.issues) }
  }
}
