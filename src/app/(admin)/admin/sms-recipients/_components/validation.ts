import { SmsRecipientInputSchema } from '@/lib/db/queries/sms-recipients'
import type { SmsRecipientFormError } from './SmsRecipientForm'

export { SmsRecipientInputSchema }

export function validateSmsRecipientInput(
  raw: unknown
):
  | { ok: true; data: ReturnType<typeof SmsRecipientInputSchema.parse> }
  | { ok: false; error: SmsRecipientFormError } {
  const result = SmsRecipientInputSchema.safeParse(raw)
  if (result.success) return { ok: true, data: result.data }

  const fieldErrs: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '')
    if (!key) continue
    fieldErrs[key] = fieldErrs[key] ? `${fieldErrs[key]}; ${issue.message}` : issue.message
  }
  return {
    ok: false,
    error: {
      message: 'Please correct the highlighted fields.',
      fields: fieldErrs
    }
  }
}

/**
 * Detects Postgres unique-violation errors for sms_recipients.
 * Returns 'phone' if the phone-unique constraint tripped, or null otherwise.
 * The actual constraint name in this DB is `sms_recipients_phone_unique`.
 */
export function detectSmsRecipientUniqueViolation(err: unknown): 'phone' | null {
  if (!err || typeof err !== 'object') return null
  const e = err as { code?: string; constraint_name?: string; message?: string }
  if (e.code !== '23505' && !/unique/i.test(e.message ?? '')) return null
  const msg = e.message ?? ''
  if (/phone/i.test(msg) || e.constraint_name?.includes('phone')) return 'phone'
  return null
}
