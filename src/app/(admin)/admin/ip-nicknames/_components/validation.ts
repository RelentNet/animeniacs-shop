import { IpNicknameInputSchema } from '@/lib/db/queries/ip-nicknames'
import type { IpNicknameFormError } from './IpNicknameForm'

export function validateIpNicknameInput(
  raw: unknown
):
  | { ok: true; data: ReturnType<typeof IpNicknameInputSchema.parse> }
  | { ok: false; error: IpNicknameFormError } {
  const result = IpNicknameInputSchema.safeParse(raw)
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
 * Detects Postgres unique-violation errors for ip_nicknames.
 * Returns 'slug' or 'square_category_id' depending on which constraint
 * tripped, or null if it's not a unique violation we recognise.
 */
export function detectIpNicknameUniqueViolation(
  err: unknown
): 'slug' | 'square_category_id' | null {
  if (!err || typeof err !== 'object') return null
  const e = err as { code?: string; constraint_name?: string; message?: string }
  if (e.code !== '23505' && !/unique/i.test(e.message ?? '')) return null
  const msg = e.message ?? ''
  if (/slug/i.test(msg) || e.constraint_name?.includes('slug')) return 'slug'
  if (/square_category_id/i.test(msg) || e.constraint_name?.includes('square_category_id')) {
    return 'square_category_id'
  }
  return null
}
