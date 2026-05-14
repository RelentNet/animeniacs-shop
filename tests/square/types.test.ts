import { describe, expect, it } from 'vitest'
import { PRODUCT_TYPES, isProductType } from '../../src/lib/square/types'

describe('isProductType', () => {
  it('accepts every value in PRODUCT_TYPES', () => {
    for (const value of PRODUCT_TYPES) {
      expect(isProductType(value)).toBe(true)
    }
  })

  it('rejects unknown values', () => {
    expect(isProductType('poster')).toBe(false)
    expect(isProductType('')).toBe(false)
  })

  it('rejects undefined', () => {
    expect(isProductType(undefined)).toBe(false)
  })
})
