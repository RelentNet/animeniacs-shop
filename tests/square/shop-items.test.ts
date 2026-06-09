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

import { getShopProducts } from '@/lib/square/items'

function item(id: string, name: string, opts: Record<string, unknown> = {}) {
  return {
    id,
    itemData: {
      name,
      isArchived: opts.archived === true,
      imageIds: opts.imageIds ?? [],
      variations: opts.variations ?? [
        { itemVariationData: { pricingType: 'FIXED_PRICING', priceMoney: { amount: 2500n } } }
      ],
      categories: opts.categories ?? []
    }
  }
}

describe('getShopProducts', () => {
  beforeEach(() => {
    mockSearchItems.mockReset()
    mockBatchGet.mockReset()
    mockBatchGet.mockResolvedValue({ objects: [] })
  })

  it('returns all active items projected to ArtistProduct, sorted by name', async () => {
    mockSearchItems.mockResolvedValueOnce({
      items: [item('B', 'Banana'), item('A', 'Apple')],
      cursor: undefined
    })
    const out = await getShopProducts()
    expect(out.map((p) => p.id)).toEqual(['A', 'B'])
    expect(out[0]).toMatchObject({ id: 'A', name: 'Apple', priceCents: 2500 })
  })

  it('filters out archived items', async () => {
    mockSearchItems.mockResolvedValueOnce({
      items: [item('A', 'Apple'), item('Z', 'Zed', { archived: true })],
      cursor: undefined
    })
    const out = await getShopProducts()
    expect(out.map((p) => p.id)).toEqual(['A'])
  })

  it('paginates via cursor and dedupes by id', async () => {
    mockSearchItems
      .mockResolvedValueOnce({ items: [item('A', 'Apple')], cursor: 'c1' })
      .mockResolvedValueOnce({
        items: [item('A', 'Apple'), item('B', 'Banana')],
        cursor: undefined
      })
    const out = await getShopProducts()
    expect(out.map((p) => p.id)).toEqual(['A', 'B'])
    expect(mockSearchItems).toHaveBeenCalledTimes(2)
    // second call must pass the cursor from the first response
    expect(mockSearchItems.mock.calls[1][0]).toMatchObject({ cursor: 'c1' })
  })

  it('returns empty array when Square has no items', async () => {
    mockSearchItems.mockResolvedValueOnce({ items: [], cursor: undefined })
    expect(await getShopProducts()).toEqual([])
  })
})
