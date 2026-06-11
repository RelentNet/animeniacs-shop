import { parseShopParams } from '@/lib/shop/parse-params'
import { describe, expect, it } from 'vitest'

describe('parseShopParams', () => {
  it('parses + normalizes valid params', () => {
    const q = parseShopParams({
      page: '2',
      q: ' Cat ',
      category: 'naruto',
      artist: 'merc',
      min: '10',
      max: '50',
      sort: 'rating'
    })
    expect(q.page).toBe(2)
    expect(q.q).toBe('Cat')
    expect(q.categorySlug).toBe('naruto')
    expect(q.artistSlug).toBe('merc')
    expect(q.minCents).toBe(1000)
    expect(q.maxCents).toBe(5000)
    expect(q.sort).toBe('rating')
    // resolved ids are filled in by the page, not the parser
    expect(q.categoryId).toBeNull()
    expect(q.artistCategoryId).toBeNull()
  })

  it('converts fractional dollar bounds to cents', () => {
    const q = parseShopParams({ min: '10.50', max: '0' })
    expect(q.minCents).toBe(1050)
    expect(q.maxCents).toBe(0)
  })

  it('defaults garbage to absent/defaults (never throws)', () => {
    const q = parseShopParams({ page: 'abc', sort: 'xyz', min: '-5', max: 'nope' })
    expect(q.page).toBe(1)
    expect(q.sort).toBeNull()
    expect(q.minCents).toBeNull()
    expect(q.maxCents).toBeNull()
  })

  it('clamps page below 1 to 1 and floors fractional pages', () => {
    expect(parseShopParams({ page: '0' }).page).toBe(1)
    expect(parseShopParams({ page: '-3' }).page).toBe(1)
    expect(parseShopParams({ page: '2.9' }).page).toBe(2)
  })

  it('drops empty/whitespace-only q and slugs', () => {
    const q = parseShopParams({ q: '   ', category: '', artist: '  ' })
    expect(q.q).toBeNull()
    expect(q.categorySlug).toBeNull()
    expect(q.artistSlug).toBeNull()
  })

  it('returns all defaults for empty input', () => {
    const q = parseShopParams({})
    expect(q).toEqual({
      q: null,
      categorySlug: null,
      artistSlug: null,
      categoryId: null,
      artistCategoryId: null,
      minCents: null,
      maxCents: null,
      sort: null,
      page: 1
    })
  })

  it('takes the first value when a param arrives as an array', () => {
    const q = parseShopParams({ q: ['first', 'second'], sort: ['price_asc', 'rating'] })
    expect(q.q).toBe('first')
    expect(q.sort).toBe('price_asc')
  })
})
