import type { SmsRecipientInput } from '@/lib/db/queries/sms-recipients'

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

export function parseSmsRecipientForm(form: FormData): SmsRecipientInput {
  const enabledRaw = form.get('enabled')
  const enabled = typeof enabledRaw === 'string' ? enabledRaw === 'true' : true

  return {
    phone: getRequired(form, 'phone'),
    label: getNullable(form, 'label'),
    enabled
  }
}
