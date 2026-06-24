import {
  DEFAULT_ART_MAX_EDGE,
  artImageUrl,
  artMaxEdge,
  isValidSquareImageId
} from '@/lib/images/art-url'
import { afterEach, describe, expect, it } from 'vitest'

describe('artImageUrl', () => {
  it('builds a same-origin proxy url, never a Square url', () => {
    expect(artImageUrl('MNFM5K3QABCDEF234567XY')).toBe('/api/art?id=MNFM5K3QABCDEF234567XY')
    expect(artImageUrl('MNFM5K3QABCDEF234567XY')).not.toMatch(/s3|amazonaws|http/)
  })

  it('url-encodes the id', () => {
    expect(artImageUrl('a b')).toBe('/api/art?id=a%20b')
  })
})

describe('isValidSquareImageId', () => {
  it('accepts Square-shaped object ids', () => {
    expect(isValidSquareImageId('MNFM5K3QABCDEF234567XY')).toBe(true)
    expect(isValidSquareImageId('abc_DEF-123')).toBe(true)
  })

  it('rejects empty, too-short, path-ish, or url-ish input (SSRF boundary)', () => {
    for (const bad of ['', 'short', '../secret', 'a/b', 'http://x', 'has space', 'a'.repeat(65)]) {
      expect(isValidSquareImageId(bad)).toBe(false)
    }
    expect(isValidSquareImageId(null)).toBe(false)
    expect(isValidSquareImageId(undefined)).toBe(false)
  })
})

describe('artMaxEdge', () => {
  const orig = process.env.ART_IMAGE_MAX_EDGE
  afterEach(() => {
    process.env.ART_IMAGE_MAX_EDGE = orig ?? ''
  })

  it('defaults when unset or invalid', () => {
    process.env.ART_IMAGE_MAX_EDGE = '' // treated as unset
    expect(artMaxEdge()).toBe(DEFAULT_ART_MAX_EDGE)
    process.env.ART_IMAGE_MAX_EDGE = 'nope'
    expect(artMaxEdge()).toBe(DEFAULT_ART_MAX_EDGE)
  })

  it('honors a valid configured value', () => {
    process.env.ART_IMAGE_MAX_EDGE = '1200'
    expect(artMaxEdge()).toBe(1200)
  })

  it('clamps to a sane range (256..4096)', () => {
    process.env.ART_IMAGE_MAX_EDGE = '50'
    expect(artMaxEdge()).toBe(256)
    process.env.ART_IMAGE_MAX_EDGE = '99999'
    expect(artMaxEdge()).toBe(4096)
  })
})
