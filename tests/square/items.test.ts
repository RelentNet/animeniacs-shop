import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSearchItems, mockBatchGet } = vi.hoisted(() => ({
  mockSearchItems: vi.fn(),
  mockBatchGet: vi.fn()
}))

vi.mock('@/lib/square/client', () => ({
  getSquareClient: () => ({
    catalog: { searchItems: mockSearchItems, batchGet: mockBatchGet }
  })
}))
// unstable_cache wraps the fn but must still invoke it in tests.
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn
}))

import { getShopProducts, resolveImageUrls } from '@/lib/square/items'

const fakeClient = {
  catalog: { searchItems: mockSearchItems, batchGet: mockBatchGet }
} as unknown as Parameters<typeof resolveImageUrls>[0]

describe('resolveImageUrls', () => {
  beforeEach(() => {
    mockBatchGet.mockReset().mockResolvedValue({ objects: [] })
  })

  it('returns an empty map without calling batchGet for empty input', async () => {
    const map = await resolveImageUrls(fakeClient, [])
    expect(map.size).toBe(0)
    expect(mockBatchGet).not.toHaveBeenCalled()
  })

  it('calls batchGet ONCE for <= 900 ids and merges the IMAGE urls', async () => {
    mockBatchGet.mockResolvedValueOnce({
      objects: [
        { id: 'img1', type: 'IMAGE', imageData: { url: 'https://x/1.jpg' } },
        { id: 'img2', type: 'IMAGE', imageData: { url: 'https://x/2.jpg' } }
      ]
    })
    const ids = Array.from({ length: 900 }, (_, i) => `img-${i}`)
    const map = await resolveImageUrls(fakeClient, ids)
    expect(mockBatchGet).toHaveBeenCalledTimes(1)
    expect(map.get('img1')).toBe('https://x/1.jpg')
    expect(map.get('img2')).toBe('https://x/2.jpg')
  })

  it('chunks > 900 ids into multiple batchGet calls (1500 ids => 2 calls) and merges', async () => {
    mockBatchGet
      .mockResolvedValueOnce({
        objects: [{ id: 'a', type: 'IMAGE', imageData: { url: 'https://x/a.jpg' } }]
      })
      .mockResolvedValueOnce({
        objects: [{ id: 'b', type: 'IMAGE', imageData: { url: 'https://x/b.jpg' } }]
      })
    const ids = Array.from({ length: 1500 }, (_, i) => `img-${i}`)
    const map = await resolveImageUrls(fakeClient, ids)
    expect(mockBatchGet).toHaveBeenCalledTimes(2)
    // first chunk is exactly 900, second is the remaining 600
    expect(mockBatchGet.mock.calls[0][0].objectIds).toHaveLength(900)
    expect(mockBatchGet.mock.calls[1][0].objectIds).toHaveLength(600)
    expect(map.get('a')).toBe('https://x/a.jpg')
    expect(map.get('b')).toBe('https://x/b.jpg')
  })
})

describe('getShopProducts updatedAt projection', () => {
  beforeEach(() => {
    mockSearchItems.mockReset()
    mockBatchGet.mockReset().mockResolvedValue({ objects: [] })
  })

  it('carries updatedAt from the Square object (string or null)', async () => {
    mockSearchItems.mockResolvedValueOnce({
      items: [
        {
          id: 'A',
          updatedAt: '2026-06-01T00:00:00Z',
          itemData: {
            name: 'Apple',
            variations: [
              { itemVariationData: { pricingType: 'FIXED_PRICING', priceMoney: { amount: 2500n } } }
            ],
            categories: []
          }
        },
        {
          id: 'B',
          itemData: {
            name: 'Banana',
            variations: [
              { itemVariationData: { pricingType: 'FIXED_PRICING', priceMoney: { amount: 2500n } } }
            ],
            categories: []
          }
        }
      ],
      cursor: undefined
    })
    const out = await getShopProducts()
    const a = out.find((p) => p.id === 'A')
    const b = out.find((p) => p.id === 'B')
    expect(a?.updatedAt).toBe('2026-06-01T00:00:00Z')
    expect(b?.updatedAt).toBeNull()
  })
})
