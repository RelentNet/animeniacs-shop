'use server'

import type { ArtistFormState } from '@/app/(admin)/admin/artists/_components/ArtistForm'
import { parseArtistForm } from '@/app/(admin)/admin/artists/_components/formData'
import {
  isUniqueSlugViolation,
  validateArtistInput
} from '@/app/(admin)/admin/artists/_components/validation'
import { createArtist } from '@/lib/db/queries/artists'
import { AvatarValidationError, saveAvatar } from '@/lib/images/upload'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

/**
 * Server action for the create-artist form.
 *
 * Flow:
 *   1. Parse FormData -> ArtistInput shape.
 *   2. Validate via Zod; collect per-field errors and short-circuit
 *      if anything fails. Form re-renders with errors in place
 *      (useFormState in the client wrapper).
 *   3. If an avatar file is attached, run it through saveAvatar
 *      (validates + resizes + writes). Inject the returned URL.
 *   4. createArtist() inserts. Unique-slug-violation maps to a
 *      friendly error.
 *   5. Revalidate /artist and /artist/<slug> (D.4 requirement).
 *   6. redirect('/admin/artists') on success.
 */
export async function createArtistAction(
  _prev: ArtistFormState,
  form: FormData
): Promise<ArtistFormState> {
  const { input, avatarFile } = parseArtistForm(form)

  const validated = validateArtistInput(input)
  if (!validated.ok) {
    return { error: validated.error }
  }

  let avatarUrl: string | null = null
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

  try {
    await createArtist({ ...input, avatarUrl })
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
  redirect('/admin/artists')
}
