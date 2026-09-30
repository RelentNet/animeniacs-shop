'use server'

import type { ArtistFormState } from '@/app/(admin)/admin/artists/_components/ArtistForm'
import { parseArtistForm } from '@/app/(admin)/admin/artists/_components/formData'
import {
  isUniqueSlugViolation,
  validateArtistInput
} from '@/app/(admin)/admin/artists/_components/validation'
import { getArtistById, setArtistRate, updateArtist } from '@/lib/db/queries/artists'
import { AvatarValidationError, saveAvatar } from '@/lib/images/upload'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

/**
 * Server action for the edit-artist form.
 *
 * Differences from createArtistAction:
 *   - takes the artist id (closed over via `.bind` in the page) and
 *     calls updateArtist instead of createArtist
 *   - slug is read-only in the form, but we still pass it through
 *     validation in case the DOM gets tampered with — the schema
 *     simply rejects any unauthorized change
 *   - revalidates the same /artist and /artist/<slug> paths as create
 *
 * The action is curried via .bind(null, id) at the page level so the
 * `id` is baked in server-side rather than trusting the form to send
 * it back.
 */
export async function updateArtistAction(
  id: string,
  _prev: ArtistFormState,
  form: FormData
): Promise<ArtistFormState> {
  const { input, avatarFile } = parseArtistForm(form)

  const validated = validateArtistInput(input)
  if (!validated.ok) {
    return { error: validated.error }
  }

  let avatarUrl: string | null | undefined = undefined
  if (avatarFile) {
    try {
      avatarUrl = await saveAvatar(avatarFile, validated.data.slug)
    } catch (err) {
      if (err instanceof AvatarValidationError) {
        return {
          error: {
            message: 'Avatar upload failed.',
            fields: { avatarFile: err.message }
          }
        }
      }
      throw err
    }
  }

  // Build the patch: only include avatarUrl in the update if the
  // operator uploaded a new file. Otherwise leave it untouched so
  // existing avatars survive an edit.
  // commissionRate is written via rate history (setArtistRate), never patched directly.
  const { commissionRate, ...rest } = input
  const patch = avatarUrl !== undefined ? { ...rest, avatarUrl } : rest

  const current = await getArtistById(id)
  const rateChanged =
    current !== undefined && Number(commissionRate) !== Number(current.commissionRate)
  const effectiveFrom = String(form.get('rateEffectiveFrom') ?? '').trim()
  if (rateChanged && !/^\d{4}-(0[1-9]|1[0-2])$/.test(effectiveFrom)) {
    return {
      error: {
        message: 'Pick the month the new commission rate takes effect.',
        fields: { rateEffectiveFrom: 'Required when the rate changes (YYYY-MM).' }
      }
    }
  }

  try {
    await updateArtist(id, patch)
    if (rateChanged) await setArtistRate(id, String(commissionRate), effectiveFrom)
  } catch (err) {
    if (isUniqueSlugViolation(err)) {
      return {
        error: {
          message: 'That slug is already in use.',
          fields: { slug: 'Slug already in use; pick a different one.' }
        }
      }
    }
    throw err
  }

  revalidatePath('/artist')
  revalidatePath(`/artist/${validated.data.slug}`)
  redirect(rateChanged ? '/admin/artists?rateChanged=1' : '/admin/artists')
}
