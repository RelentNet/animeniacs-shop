import { describe, expect, it } from 'vitest'
import { classifyLine } from '@/lib/shipping/classify'

describe('shipping/classify classifyLine', () => {
  it('Acrylic Wall Art variation → acrylic', () => {
    expect(classifyLine({ variationName: 'Acrylic Wall Art', categoryNames: ['Acrylic Wall Art', 'Tepidzeal'] })).toBe(
      'acrylic'
    )
  })

  it('Vinyl Decal Prints variation → flat (decal)', () => {
    expect(classifyLine({ variationName: 'Vinyl Decal Prints', categoryNames: ['Acrylic Wall Art'] })).toBe('flat')
  })

  it('Lit Box Frame category (Regular variation) → frame', () => {
    expect(classifyLine({ variationName: 'Regular', categoryNames: ['Lit Box Frame'] })).toBe('frame')
  })

  it('stickers / posters / other → flat', () => {
    expect(classifyLine({ variationName: 'Regular', categoryNames: ['Slaps'] })).toBe('flat')
    expect(classifyLine({ variationName: 'Regular', categoryNames: [] })).toBe('flat')
  })

  it('media choice wins over category for artworks', () => {
    // An item that also sits under Lit Box Frame but is bought as a decal ships flat.
    expect(classifyLine({ variationName: 'Vinyl Decal Prints', categoryNames: ['Lit Box Frame'] })).toBe('flat')
  })
})
