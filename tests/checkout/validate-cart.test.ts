import { describe, expect, it, vi } from 'vitest'

const { mockGetProductById } = vi.hoisted(() => ({ mockGetProductById: vi.fn() }))
vi.mock('@/lib/products/cache', () => ({ getProductById: mockGetProductById }))

import { validateCart } from '@/lib/checkout/validate-cart'

function product(itemId: string, varId: string, name: string, priceCents: number) {
  return {
    id: itemId,
    name,
    description: null,
    descriptionHtml: null,
    variations: [
      {
        id: varId,
        name: 'Default',
        price: { amount: priceCents, currency: 'USD' },
        sku: null,
        optionValueIds: []
      }
    ],
    images: [],
    categoryIds: [],
    itemOptions: [],
    updatedAt: '2026-05-26T00:00:00Z'
  }
}

describe('validateCart', () => {
  it('returns ok with line list when all prices match', async () => {
    mockGetProductById.mockImplementation(async (id: string) =>
      product(id, 'V', `${id} name`, 2500)
    )
    const result = await validateCart([
      { catalogItemId: 'A', variationId: 'V', quantity: 2, expectedUnitPriceCents: 2500 }
    ])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.lines).toHaveLength(1)
      expect(result.lines[0].name).toBe('A name')
      expect(result.lines[0].unitPriceCents).toBe(2500)
    }
  })

  it('tolerates 1 cent drift (rounding)', async () => {
    mockGetProductById.mockImplementation(async () => product('A', 'V', 'A', 2501))
    const result = await validateCart([
      { catalogItemId: 'A', variationId: 'V', quantity: 1, expectedUnitPriceCents: 2500 }
    ])
    expect(result.ok).toBe(true)
  })

  it('rejects drift > 1 cent', async () => {
    mockGetProductById.mockImplementation(async () => product('A', 'V', 'A', 3000))
    const result = await validateCart([
      { catalogItemId: 'A', variationId: 'V', quantity: 1, expectedUnitPriceCents: 2500 }
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.mismatches[0]).toEqual({
        catalogItemId: 'A',
        variationId: 'V',
        expected: 2500,
        actual: 3000
      })
    }
  })

  it('rejects item that no longer exists (getProductById returns null)', async () => {
    mockGetProductById.mockResolvedValue(null)
    const result = await validateCart([
      { catalogItemId: 'GONE', variationId: 'V', quantity: 1, expectedUnitPriceCents: 2500 }
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.mismatches[0]).toEqual({
        catalogItemId: 'GONE',
        variationId: 'V',
        expected: 2500,
        actual: null
      })
    }
  })

  it('rejects variation that no longer exists on product', async () => {
    mockGetProductById.mockImplementation(async () => product('A', 'V_REAL', 'A', 2500))
    const result = await validateCart([
      { catalogItemId: 'A', variationId: 'V_GONE', quantity: 1, expectedUnitPriceCents: 2500 }
    ])
    expect(result.ok).toBe(false)
  })

  it('returns ALL mismatches, not just the first', async () => {
    mockGetProductById.mockImplementation(async (id: string) =>
      id === 'A' ? product('A', 'V', 'A', 9999) : product('B', 'V', 'B', 9999)
    )
    const result = await validateCart([
      { catalogItemId: 'A', variationId: 'V', quantity: 1, expectedUnitPriceCents: 100 },
      { catalogItemId: 'B', variationId: 'V', quantity: 1, expectedUnitPriceCents: 200 }
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.mismatches).toHaveLength(2)
  })
})
