import { describe, expect, it, vi } from 'vitest'

const mockGetItems = vi.fn()
const mockArtistByCat = vi.fn()
const mockIpNickByCat = vi.fn()

vi.mock('@/lib/square/items', () => ({ getItemsByCategoryId: mockGetItems }))
vi.mock('@/lib/db/queries/artists', () => ({ getArtistByCategoryId: mockArtistByCat }))
vi.mock('@/lib/db/queries/ip-nicknames', () => ({ getIpNicknameByCategoryId: mockIpNickByCat }))

function items(...ids: string[]) {
  return ids.map((id) => ({
    id,
    name: `Item ${id}`,
    imageUrl: null,
    priceCents: 100,
    categoryIds: []
  }))
}

describe('getRelatedProducts', () => {
  it('artist match wins (priority 1)', async () => {
    mockArtistByCat.mockResolvedValueOnce({
      slug: 'noah',
      displayName: 'Noah',
      squareCategoryId: 'ART_CAT'
    })
    mockGetItems.mockResolvedValueOnce(items('A', 'B', 'CURRENT'))
    const { getRelatedProducts } = await import('@/lib/categories/related')
    const result = await getRelatedProducts('CURRENT', ['ART_CAT'])
    expect(result.source).toEqual({ kind: 'artist', slug: 'noah', displayName: 'Noah' })
    expect(result.items.map((i) => i.id)).toEqual(['A', 'B']) // excludes CURRENT
  })

  it('falls back to IP nickname (priority 2) when no artist matches', async () => {
    mockArtistByCat.mockResolvedValue(undefined)
    mockIpNickByCat.mockResolvedValueOnce({
      slug: 'ramen-shop',
      nickname: 'Ramen Shop',
      squareCategoryId: 'IP_CAT',
      isPublic: true
    })
    mockGetItems.mockResolvedValueOnce(items('X', 'Y'))
    const { getRelatedProducts } = await import('@/lib/categories/related')
    const result = await getRelatedProducts('CURRENT', ['IP_CAT'])
    expect(result.source).toEqual({ kind: 'ip', slug: 'ramen-shop', nickname: 'Ramen Shop' })
    expect(result.items.map((i) => i.id)).toEqual(['X', 'Y'])
  })

  it('returns empty + null source when neither matches', async () => {
    mockArtistByCat.mockResolvedValue(undefined)
    mockIpNickByCat.mockResolvedValue(undefined)
    const { getRelatedProducts } = await import('@/lib/categories/related')
    const result = await getRelatedProducts('CURRENT', ['UNMAPPED'])
    expect(result.source).toBeNull()
    expect(result.items).toEqual([])
  })

  it('caps results at 6', async () => {
    mockArtistByCat.mockResolvedValueOnce({
      slug: 'a',
      displayName: 'A',
      squareCategoryId: 'C'
    })
    mockGetItems.mockResolvedValueOnce(items('1', '2', '3', '4', '5', '6', '7', '8'))
    const { getRelatedProducts } = await import('@/lib/categories/related')
    const result = await getRelatedProducts('CURRENT', ['C'])
    expect(result.items).toHaveLength(6)
  })
})
