import { toE164Phone } from '@/lib/shipping/phone'
import { describe, expect, it } from 'vitest'

describe('toE164Phone', () => {
  it('prefixes +1 to a bare 10-digit US number (what buyers actually type)', () => {
    expect(toE164Phone('4042221234', 'US')).toBe('+14042221234')
    expect(toE164Phone('(404) 222-1234', 'US')).toBe('+14042221234')
    expect(toE164Phone('404-222-1234', 'US')).toBe('+14042221234')
    expect(toE164Phone('404.222.1234', 'us')).toBe('+14042221234')
    expect(toE164Phone(' 404 222 1234 ', 'US')).toBe('+14042221234')
  })

  it('does not double the national 1 for US/CA', () => {
    expect(toE164Phone('14042221234', 'US')).toBe('+14042221234')
    expect(toE164Phone('1 (604) 222-1234', 'CA')).toBe('+16042221234')
  })

  it('keeps an already-international number, cleaning punctuation', () => {
    expect(toE164Phone('+14042221234', 'US')).toBe('+14042221234')
    expect(toE164Phone('+1 404 222 1234', 'GB')).toBe('+14042221234')
    expect(toE164Phone('+44 7700 900123', 'US')).toBe('+447700900123')
    expect(toE164Phone('0044 7700 900123', 'GB')).toBe('+447700900123')
  })

  it('prefixes the dial code and drops the trunk 0 for UK/EU numbers', () => {
    expect(toE164Phone('07700 900123', 'GB')).toBe('+447700900123')
    expect(toE164Phone('030 1234567', 'DE')).toBe('+49301234567')
    expect(toE164Phone('06 12 34 56 78', 'FR')).toBe('+33612345678')
    expect(toE164Phone('612345678', 'ES')).toBe('+34612345678')
  })

  it('strips a trailing extension', () => {
    expect(toE164Phone('404-222-1234 x55', 'US')).toBe('+14042221234')
    expect(toE164Phone('4042221234 ext. 7', 'US')).toBe('+14042221234')
  })

  it('returns undefined (so the caller omits the field) when it cannot produce E.164', () => {
    expect(toE164Phone('', 'US')).toBeUndefined()
    expect(toE164Phone(null, 'US')).toBeUndefined()
    expect(toE164Phone(undefined, 'US')).toBeUndefined()
    expect(toE164Phone('   ', 'US')).toBeUndefined()
    expect(toE164Phone('n/a', 'US')).toBeUndefined()
    expect(toE164Phone('555', 'US')).toBeUndefined() // too short for NANP
    expect(toE164Phone('40422212345', 'US')).toBeUndefined() // 11 digits not starting with 1
    expect(toE164Phone('4042221234', 'JP')).toBeUndefined() // not a shippable country → no dial code
    expect(toE164Phone('4042221234', '')).toBeUndefined()
    expect(toE164Phone('+1', 'US')).toBeUndefined() // too short for E.164
    expect(toE164Phone('+12345678901234567', 'US')).toBeUndefined() // >15 digits
    expect(toE164Phone('+0123456789', 'US')).toBeUndefined() // country code can't start with 0
  })

  it('never throws on garbage', () => {
    expect(() => toE164Phone('💥 call me', 'US')).not.toThrow()
    expect(toE164Phone('💥 call me', 'US')).toBeUndefined()
  })
})
