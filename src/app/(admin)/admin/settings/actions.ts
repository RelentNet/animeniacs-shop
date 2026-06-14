'use server'

import { upsertSetting } from '@/lib/db/queries/site-settings'
import { revalidatePath } from 'next/cache'
import type { PromoBarFormState } from './_components/PromoBarSettingsForm'
import { parsePromoBarForm } from './_components/formData'
import { validatePromoBarInput } from './_components/validation'

/**
 * Save the promo bar setting. updatedBy is null: the existing admin
 * actions (ip-nicknames) do not capture session identity and
 * site_settings.updated_by is nullable. Revalidates the whole layout subtree
 * ('/', 'layout') to bust the cached promo bar everywhere: the bar lives in
 * the root layout, so the now-ISR'd /artist + /category pages embed it in
 * their cached HTML. '/' alone would only revalidate the home route (spec §5).
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

  revalidatePath('/', 'layout')
  revalidatePath('/admin/settings')
  return { saved: true }
}
