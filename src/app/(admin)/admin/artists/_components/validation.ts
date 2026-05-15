import { ArtistInputSchema } from '@/lib/db/queries/artists'
import type { ArtistFormError } from './ArtistForm'

/**
 * Maps a Zod error's field-level issues to the per-field `fields`
 * dictionary the form expects. Joins multiple issues on the same
 * path with '; '.
 */
export function validateArtistInput(
  raw: unknown
):
  | { ok: true; data: ReturnType<typeof ArtistInputSchema.parse> }
  | { ok: false; error: ArtistFormError } {
  const result = ArtistInputSchema.safeParse(raw)
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
 * Detects Postgres unique-violation errors from drizzle/postgres-js so
 * the server action can surface "slug already in use" instead of a
 * generic 500.
 */
export function isUniqueSlugViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; constraint_name?: string; message?: string }
  // postgres-js reports SQLSTATE 23505 for unique violations.
  if (e.code === '23505') return true
  if (typeof e.message === 'string' && /unique.*slug|artists_slug_unique/i.test(e.message)) {
    return true
  }
  return false
}
