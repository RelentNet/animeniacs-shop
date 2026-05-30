'use server'

import { parseSmsRecipientForm } from '@/app/(admin)/admin/sms-recipients/_components/formData'
import type { SmsRecipientFormState } from '@/app/(admin)/admin/sms-recipients/_components/SmsRecipientForm'
import {
  detectSmsRecipientUniqueViolation,
  validateSmsRecipientInput
} from '@/app/(admin)/admin/sms-recipients/_components/validation'
import { createSmsRecipient } from '@/lib/db/queries/sms-recipients'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createSmsRecipientAction(
  _prev: SmsRecipientFormState,
  form: FormData
): Promise<SmsRecipientFormState> {
  const input = parseSmsRecipientForm(form)
  const validated = validateSmsRecipientInput(input)
  if (!validated.ok) return { error: validated.error }

  try {
    await createSmsRecipient(input)
  } catch (err) {
    const which = detectSmsRecipientUniqueViolation(err)
    if (which === 'phone') {
      return {
        error: {
          message: 'That phone number is already used by another recipient.',
          fields: { phone: 'Phone already used; edit the existing row or pick a different number.' }
        }
      }
    }
    throw err
  }

  revalidatePath('/admin/sms-recipients')
  redirect('/admin/sms-recipients')
}
