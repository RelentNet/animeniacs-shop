'use server'

import type { IpNicknameFormState } from '@/app/(admin)/admin/ip-nicknames/_components/IpNicknameForm'
import { parseIpNicknameForm } from '@/app/(admin)/admin/ip-nicknames/_components/formData'
import {
  detectIpNicknameUniqueViolation,
  validateIpNicknameInput
} from '@/app/(admin)/admin/ip-nicknames/_components/validation'
import { updateIpNickname } from '@/lib/db/queries/ip-nicknames'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function updateIpNicknameAction(
  id: string,
  _prev: IpNicknameFormState,
  form: FormData
): Promise<IpNicknameFormState> {
  const input = parseIpNicknameForm(form)
  const validated = validateIpNicknameInput(input)
  if (!validated.ok) return { error: validated.error }

  try {
    await updateIpNickname(id, input)
  } catch (err) {
    const which = detectIpNicknameUniqueViolation(err)
    if (which === 'slug') {
      return {
        error: {
          message: 'That slug is already in use.',
          fields: { slug: 'Slug already in use; pick a different one.' }
        }
      }
    }
    if (which === 'square_category_id') {
      return {
        error: {
          message: 'That Square category already has a nickname on another row.',
          fields: { squareCategoryId: 'Already mapped to another nickname.' }
        }
      }
    }
    throw err
  }

  revalidatePath('/admin/ip-nicknames')
  revalidatePath(`/category/${validated.data.slug}`)
  redirect('/admin/ip-nicknames')
}
