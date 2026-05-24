import type { IpNicknameInput } from '@/lib/db/queries/ip-nicknames'

function getNullable(form: FormData, key: string): string | null {
  const v = form.get(key)
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  return trimmed.length === 0 ? null : trimmed
}

function getRequired(form: FormData, key: string): string {
  const v = form.get(key)
  if (typeof v !== 'string') return ''
  return v.trim()
}

export function parseIpNicknameForm(form: FormData): IpNicknameInput {
  const isPublicRaw = form.get('isPublic')
  const isPublic = typeof isPublicRaw === 'string' ? isPublicRaw === 'true' : true

  return {
    slug: getRequired(form, 'slug'),
    nickname: getRequired(form, 'nickname'),
    squareCategoryId: getRequired(form, 'squareCategoryId'),
    description: getNullable(form, 'description'),
    isPublic
  }
}
