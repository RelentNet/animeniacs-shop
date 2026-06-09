import { PromoBarValueSchema } from '@/lib/db/queries/site-settings'
import type { PromoBarFormError } from './PromoBarSettingsForm'

export function validatePromoBarInput(
  raw: unknown
):
  | { ok: true; data: ReturnType<typeof PromoBarValueSchema.parse> }
  | { ok: false; error: PromoBarFormError } {
  const result = PromoBarValueSchema.safeParse(raw)
  if (result.success) return { ok: true, data: result.data }

  const fieldErrs: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '')
    if (!key) continue
    fieldErrs[key] = fieldErrs[key] ? `${fieldErrs[key]}; ${issue.message}` : issue.message
  }
  return {
    ok: false,
    error: { message: 'Please correct the highlighted fields.', fields: fieldErrs }
  }
}
