'use server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { updateOwnProfile } from '@/lib/db/queries/artist-changes'
import { ArtistSelfInputSchema, getArtistById } from '@/lib/db/queries/artists'
import { getArtistByAccountEmail } from '@/lib/db/queries/commissions'
import { AvatarValidationError, saveAvatar } from '@/lib/images/upload'
import { notifyArtistPaymentChange } from '@/lib/notifications/artist-payment'
import { revalidatePath } from 'next/cache'

export interface ProfileFormState {
  ok?: string
  error?: string
  fields?: Record<string, string>
}

const ALLOWED_KEYS = new Set<string>([...Object.keys(ArtistSelfInputSchema.shape), 'avatarFile'])

function nullable(v: FormDataEntryValue | null): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

/**
 * Artist self-serve profile save (DAN-140). The artist is resolved from the
 * SESSION email only; no artist id is ever read from the form. Any posted key
 * outside the allowlist (displayName, slug, commissionRate, status, ...) is
 * rejected outright, and the Zod schema is `.strict()` as a second layer.
 */
export async function updateOwnProfileAction(
  _prev: ProfileFormState,
  form: FormData
): Promise<ProfileFormState> {
  const { email, userId } = await getCurrentUser()
  const linked = email ? await getArtistByAccountEmail(email) : null
  if (!email || !linked) return { error: 'This account is not linked to an artist profile.' }

  // Next injects `$ACTION_*` bookkeeping keys into action FormData; ignore only those.
  const forbidden = [...new Set(form.keys())].filter(
    (k) => !ALLOWED_KEYS.has(k) && !k.startsWith('$ACTION')
  )
  if (forbidden.length > 0) {
    return { error: `You can't change: ${forbidden.join(', ')}. Contact us to change those.` }
  }

  const raw: Record<string, string | null> = {}
  for (const k of Object.keys(ArtistSelfInputSchema.shape)) raw[k] = nullable(form.get(k))
  const parsed = ArtistSelfInputSchema.safeParse(raw)
  if (!parsed.success) {
    const fields: Record<string, string> = {}
    for (const i of parsed.error.issues) {
      const key = String(i.path[0] ?? '')
      if (key) fields[key] = fields[key] ? `${fields[key]}; ${i.message}` : i.message
    }
    return { error: 'Please correct the highlighted fields.', fields }
  }

  const artist = await getArtistById(linked.id)
  if (!artist) return { error: 'Artist profile not found.' }

  const patch: Record<string, string | null | undefined> = { ...parsed.data }
  const avatarRaw = form.get('avatarFile')
  if (avatarRaw instanceof File && avatarRaw.size > 0) {
    try {
      patch.avatarUrl = await saveAvatar(avatarRaw, artist.slug)
    } catch (err) {
      if (err instanceof AvatarValidationError) {
        return { error: 'Avatar upload failed.', fields: { avatarFile: err.message } }
      }
      throw err
    }
  }

  const result = await updateOwnProfile(artist.id, patch, { userId: userId ?? null, email })

  if (result.paymentChanges.length > 0) {
    try {
      await notifyArtistPaymentChange({
        artistName: result.artistName,
        accountEmail: artist.accountEmail,
        changes: result.paymentChanges,
        at: new Date()
      })
    } catch (err) {
      console.error('[artist-profile] payment-change alert failed:', err)
    }
  }

  revalidatePath('/artist')
  revalidatePath(`/artist/${artist.slug}`)
  revalidatePath('/account/profile')
  return {
    ok:
      result.changes.length === 0 ? 'Nothing changed.' : `Saved ${result.changes.length} change(s).`
  }
}
