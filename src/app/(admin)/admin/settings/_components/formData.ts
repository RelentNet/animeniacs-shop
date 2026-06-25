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

/** Dollars string ("5", "5.00") → integer cents; NaN passes through for Zod to reject. */
function dollarsToCents(s: string): number {
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? Math.round(n * 100) : Number.NaN
}

/**
 * Parse the shipping settings form into a candidate value. Fees are entered in
 * DOLLARS for the operator and converted to cents here; validation (shape,
 * ranges) happens in validation.ts via ShippingSettingsSchema.
 */
export function parseShippingForm(form: FormData): unknown {
  return {
    shipFrom: {
      name: getStr(form, 'sf_name'),
      street1: getStr(form, 'sf_street1'),
      street2: getStr(form, 'sf_street2'),
      city: getStr(form, 'sf_city'),
      state: getStr(form, 'sf_state'),
      zip: getStr(form, 'sf_zip'),
      country: getStr(form, 'sf_country').toUpperCase(),
      phone: getStr(form, 'sf_phone'),
      email: getStr(form, 'sf_email')
    },
    decalFlatCents: dollarsToCents(getStr(form, 'decalFlatDollars')),
    fallbackFlatCents: dollarsToCents(getStr(form, 'fallbackFlatDollars')),
    markupPercent: Number.parseFloat(getStr(form, 'markupPercent') || '0')
  }
}
