import { describe, expect, it } from 'vitest'
import { isShippable, normalizeCountry } from '@/lib/shipping/countries'

describe('shipping/countries', () => {
  it('accepts US, Canada, UK and EU members (case-insensitive)', () => {
    for (const c of ['US', 'us', ' Us ', 'CA', 'GB', 'FR', 'DE', 'ES', 'SE', 'IE']) {
      expect(isShippable(c)).toBe(true)
    }
  })

  it('rejects non-allowlisted destinations and empty input', () => {
    for (const c of ['JP', 'MX', 'AU', 'BR', 'CH', 'NO', '', null, undefined]) {
      expect(isShippable(c)).toBe(false)
    }
  })

  it('normalizeCountry upper-cases and trims', () => {
    expect(normalizeCountry(' gb ')).toBe('GB')
    expect(normalizeCountry(null)).toBe('')
  })
})
