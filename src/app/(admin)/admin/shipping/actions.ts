'use server'

import { saveShippingSettings } from '@/lib/db/queries/shipping-settings'
import { revalidatePath } from 'next/cache'
import type { ShippingFormState } from './_components/ShippingSettingsForm'
import { parseShippingForm } from './_components/formData'
import { validateShippingInput } from './_components/validation'

/**
 * Save the shipping settings (ship-from origin, decal flat fee, fallback flat
 * fee, markup %, per-box packaging fees). Fees arrive in dollars and are stored
 * as cents. The rate/checkout path reads these via getShippingSettings (cached
 * ~60s, so edits apply within a minute). Stays on the page with a saved banner;
 * updatedBy is null (parity with the other admin settings actions —
 * site_settings.updated_by is nullable).
 */
export async function saveShippingAction(
  _prev: ShippingFormState,
  form: FormData
): Promise<ShippingFormState> {
  const input = parseShippingForm(form)
  const validated = validateShippingInput(input)
  if (!validated.ok) return { error: validated.error }

  await saveShippingSettings(validated.data, null)

  revalidatePath('/admin/shipping')
  return { saved: true }
}
