import { describe, expect, it } from 'vitest'
import {
  parseShippingForm
} from '@/app/(admin)/admin/shipping/_components/formData'
import { validateShippingInput } from '@/app/(admin)/admin/shipping/_components/validation'
import {
  DEFAULT_SHIPPING_SETTINGS,
  ShippingSettingsSchema
} from '@/lib/db/queries/shipping-settings'

function form(fields: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.append(k, v)
  return f
}

const COMPLETE = {
  sf_name: 'Animeniacs',
  sf_street1: '100 Studio Way',
  sf_street2: 'Unit 2',
  sf_city: 'Atlanta',
  sf_state: 'GA',
  sf_zip: '30303',
  sf_country: 'us',
  sf_phone: '4045551234',
  sf_email: 'ops@animeniacs.shop',
  decalFlatDollars: '5.00',
  fallbackFlatDollars: '12.50',
  markupPercent: '10'
}

describe('shipping settings', () => {
  it('defaults are sensible', () => {
    expect(DEFAULT_SHIPPING_SETTINGS.decalFlatCents).toBe(500)
    expect(DEFAULT_SHIPPING_SETTINGS.fallbackFlatCents).toBe(1000)
    expect(DEFAULT_SHIPPING_SETTINGS.markupPercent).toBe(0)
    expect(DEFAULT_SHIPPING_SETTINGS.shipFrom.country).toBe('US')
    expect(DEFAULT_SHIPPING_SETTINGS.packagingFeesCents).toEqual({
      single_acrylic: 0,
      frame: 0,
      '3_frames': 0
    })
  })

  it('parses {} to all-defaults (partial settings fill in)', () => {
    expect(ShippingSettingsSchema.parse({})).toEqual(DEFAULT_SHIPPING_SETTINGS)
  })

  it('parses per-box packaging fees: dollars→cents, blanks→0', () => {
    const result = validateShippingInput(
      parseShippingForm(form({ ...COMPLETE, pkg_single_acrylic: '2.50', pkg_3_frames: '4' }))
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.packagingFeesCents).toEqual({
      single_acrylic: 250,
      frame: 0, // left blank → 0
      '3_frames': 400
    })
  })

  it('parses a complete form: dollars→cents, country upper-cased', () => {
    const result = validateShippingInput(parseShippingForm(form(COMPLETE)))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.decalFlatCents).toBe(500)
    expect(result.data.fallbackFlatCents).toBe(1250)
    expect(result.data.markupPercent).toBe(10)
    expect(result.data.shipFrom.country).toBe('US')
    expect(result.data.shipFrom.city).toBe('Atlanta')
  })

  it('rejects a missing required origin field', () => {
    const result = validateShippingInput(parseShippingForm(form({ ...COMPLETE, sf_street1: '' })))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.fields?.shipFrom).toBeTruthy()
  })

  it('rejects a non-numeric fee', () => {
    const result = validateShippingInput(parseShippingForm(form({ ...COMPLETE, decalFlatDollars: 'abc' })))
    expect(result.ok).toBe(false)
  })
})
