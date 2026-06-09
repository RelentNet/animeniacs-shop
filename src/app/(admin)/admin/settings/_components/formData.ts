import type { PromoBarValue } from '@/lib/db/queries/site-settings'

function getStr(form: FormData, key: string): string {
  const v = form.get(key)
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * Parse the promo bar form into a candidate value. `enabled` is a
 * checkbox (present === 'on' when checked). Colors/text/link are strings.
 * Validation (shape, hex, URL) happens in validation.ts via Zod.
 */
export function parsePromoBarForm(form: FormData): PromoBarValue {
  return {
    enabled: form.get('enabled') === 'on',
    text: getStr(form, 'text'),
    link: getStr(form, 'link'),
    bgColor: getStr(form, 'bgColor'),
    textColor: getStr(form, 'textColor')
  }
}
