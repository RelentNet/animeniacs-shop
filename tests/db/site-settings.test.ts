import { PromoBarValueSchema } from '@/lib/db/queries/site-settings'
import { describe, expect, it } from 'vitest'

describe('PromoBarValueSchema', () => {
  const valid = {
    enabled: true,
    text: 'Free shipping over $50',
    link: 'https://example.com/sale',
    bgColor: '#1a1a2e',
    textColor: '#ffffff'
  }

  it('accepts a valid promo bar value', () => {
    expect(PromoBarValueSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts an empty link', () => {
    expect(PromoBarValueSchema.safeParse({ ...valid, link: '' }).success).toBe(true)
  })

  it('rejects empty text', () => {
    expect(PromoBarValueSchema.safeParse({ ...valid, text: '' }).success).toBe(false)
  })

  it('rejects a non-hex bgColor', () => {
    expect(PromoBarValueSchema.safeParse({ ...valid, bgColor: 'red' }).success).toBe(false)
  })

  it('rejects a non-URL link', () => {
    expect(PromoBarValueSchema.safeParse({ ...valid, link: 'not a url' }).success).toBe(false)
  })
})
