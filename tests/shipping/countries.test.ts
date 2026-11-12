import { describe, expect, it } from 'vitest'
import { DEFAULT_SHIPPING_SETTINGS } from '@/lib/db/queries/shipping-settings'
import {
  CANDIDATE_COUNTRIES,
  countryConfig,
  enabledCountryOptions,
  isShippable,
  normalizeCountry,
  resolveCountryFees
} from '@/lib/shipping/countries'

const EU_27 = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE'
]

describe('shipping/countries', () => {
  it('candidates are exactly US, PR, CA, GB + EU-27', () => {
    expect(CANDIDATE_COUNTRIES.map((c) => c.code).sort()).toEqual(
      ['US', 'PR', 'CA', 'GB', ...EU_27].sort()
    )
  })

  it('defaults (nothing stored): only US, PR, CA are shippable', () => {
    for (const c of ['US', 'us', ' Pr ', 'CA']) expect(isShippable(undefined, c)).toBe(true)
    for (const c of ['GB', 'DE', 'FR', 'JP', 'MX', '', null, undefined]) {
      expect(isShippable(undefined, c)).toBe(false)
    }
    expect(enabledCountryOptions(undefined).map((c) => c.name)).toEqual([
      'United States',
      'Puerto Rico',
      'Canada'
    ])
    // Same result through the parsed default settings.
    expect(enabledCountryOptions(DEFAULT_SHIPPING_SETTINGS.countries).map((c) => c.code)).toEqual([
      'US',
      'PR',
      'CA'
    ])
  })

  it('default no-live-rate: US + PR use the global fallback; CA and others block', () => {
    const s = { decalFlatCents: 500, fallbackFlatCents: 1000, countries: undefined }
    expect(resolveCountryFees(s, 'US')).toEqual({ decalFlatCents: 500, noLiveRateFlatCents: 1000 })
    expect(resolveCountryFees(s, 'PR')).toEqual({ decalFlatCents: 500, noLiveRateFlatCents: 1000 })
    expect(resolveCountryFees(s, 'CA')).toEqual({ decalFlatCents: 500, noLiveRateFlatCents: null })
    expect(resolveCountryFees(s, 'GB').noLiveRateFlatCents).toBeNull()
    expect(resolveCountryFees(s, 'JP').noLiveRateFlatCents).toBeNull()
  })

  it('enabling GB makes it shippable and listed; non-candidates stay closed', () => {
    const countries = {
      ...DEFAULT_SHIPPING_SETTINGS.countries,
      GB: {
        enabled: true,
        decalFlatCents: null,
        noLiveRate: 'block' as const,
        noLiveRateFlatCents: null
      },
      JP: {
        enabled: true,
        decalFlatCents: null,
        noLiveRate: 'flat' as const,
        noLiveRateFlatCents: 1
      }
    }
    expect(isShippable(countries, 'GB')).toBe(true)
    expect(enabledCountryOptions(countries).map((c) => c.code)).toEqual(['US', 'PR', 'CA', 'GB'])
    expect(isShippable(countries, 'JP')).toBe(false)
    expect(countryConfig(countries, 'JP').enabled).toBe(false)
  })

  it('normalizeCountry upper-cases and trims', () => {
    expect(normalizeCountry(' gb ')).toBe('GB')
    expect(normalizeCountry(null)).toBe('')
  })
})
