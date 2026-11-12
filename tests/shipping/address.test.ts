import { describe, expect, it } from 'vitest'
import { CheckoutAddressSchema, toShippoAddress, toSquareAddress } from '@/lib/shipping/address'
import { toE164Phone } from '@/lib/shipping/phone'

const BASE = {
  firstName: 'B',
  lastName: 'One',
  line1: '1 Calle Sol',
  city: 'San Juan',
  zip: '00901'
}

describe('Puerto Rico addressing (DAN-490)', () => {
  it('rates + pays as a US domestic address with state PR', () => {
    const a = CheckoutAddressSchema.parse({ ...BASE, state: '', country: 'pr' })
    expect(a.country).toBe('PR') // the buyer's choice is kept for policy + records
    expect(toShippoAddress(a)).toMatchObject({ country: 'US', state: 'PR', zip: '00901' })
    expect(toSquareAddress(a)).toMatchObject({ country: 'US', administrativeDistrictLevel1: 'PR' })
  })

  it('leaves other countries untouched', () => {
    const a = CheckoutAddressSchema.parse({
      ...BASE,
      city: 'Toronto',
      state: 'ON',
      zip: 'M5V 2T6',
      country: 'CA'
    })
    expect(toShippoAddress(a)).toMatchObject({ country: 'CA', state: 'ON' })
    expect(toSquareAddress(a)).toMatchObject({ country: 'CA', administrativeDistrictLevel1: 'ON' })
  })

  it('PR phones normalize with the NANP +1 code', () => {
    expect(toE164Phone('787-555-0100', 'PR')).toBe('+17875550100')
  })
})
