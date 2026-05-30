'use server'

import { parseSmsRecipientForm } from '@/app/(admin)/admin/sms-recipients/_components/formData'
import type { SmsRecipientFormState } from '@/app/(admin)/admin/sms-recipients/_components/SmsRecipientForm'
import {
  detectSmsRecipientUniqueViolation,
  validateSmsRecipientInput
} from '@/app/(admin)/admin/sms-recipients/_components/validation'
import { deleteSmsRecipient, updateSmsRecipient } from '@/lib/db/queries/sms-recipients'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function updateSmsRecipientAction(
  id: number,
  _prev: SmsRecipientFormState,
  form: FormData
): Promise<SmsRecipientFormState> {
  const input = parseSmsRecipientForm(form)
  const validated = validateSmsRecipientInput(input)
  if (!validated.ok) return { error: validated.error }

  try {
    await updateSmsRecipient(id, input)
  } catch (err) {
    const which = detectSmsRecipientUniqueViolation(err)
    if (which === 'phone') {
      return {
        error: {
          message: 'That phone number is already used by another recipient.',
          fields: { phone: 'Phone already used on another row.' }
        }
      }
    }
    throw err
  }

  revalidatePath('/admin/sms-recipients')
  redirect('/admin/sms-recipients')
}

export async function deleteSmsRecipientAction(id: number): Promise<void> {
  await deleteSmsRecipient(id)
  revalidatePath('/admin/sms-recipients')
  redirect('/admin/sms-recipients')
}
