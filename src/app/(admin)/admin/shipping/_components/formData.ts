function getStr(form: FormData, key: string): string {
  const v = form.get(key)
  return typeof v === 'string' ? v.trim() : ''
}

/** Dollars string ("5", "5.00") → integer cents; NaN passes through for Zod to reject. */
function dollarsToCents(s: string): number {
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? Math.round(n * 100) : Number.NaN
}

/** Packaging fees default to $0 when left blank (they're optional add-ons). */
function packagingDollarsToCents(s: string): number {
  return dollarsToCents(s || '0')
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
    markupPercent: Number.parseFloat(getStr(form, 'markupPercent') || '0'),
    packagingFeesCents: {
      single_acrylic: packagingDollarsToCents(getStr(form, 'pkg_single_acrylic')),
      frame: packagingDollarsToCents(getStr(form, 'pkg_frame')),
      '3_frames': packagingDollarsToCents(getStr(form, 'pkg_3_frames'))
    }
  }
}
