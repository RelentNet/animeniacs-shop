'use server'

import { upsertSetting } from '@/lib/db/queries/site-settings'
import { revalidatePath } from 'next/cache'
import type { PromoBarFormState } from './_components/PromoBarSettingsForm'
import { parsePromoBarForm } from './_components/formData'
import { validatePromoBarInput } from './_components/validation'

/**
 * Save the promo bar setting. updatedBy is null: the existing admin
 * actions (ip-nicknames) do not capture session identity and
 * site_settings.updated_by is nullable. Revalidates '/' to bust the
 * cached promo bar read so the storefront reflects the change immediately.
 *
 * Does not redirect — stays on the settings page and shows a saved banner,
 * so the operator can verify and keep editing.
 */
export async function savePromoBarAction(
  _prev: PromoBarFormState,
  form: FormData
): Promise<PromoBarFormState> {
  const input = parsePromoBarForm(form)
  const validated = validatePromoBarInput(input)
  if (!validated.ok) return { error: validated.error }

  await upsertSetting('promo_bar', validated.data, null)

  revalidatePath('/')
  revalidatePath('/admin/settings')
  return { saved: true }
}
