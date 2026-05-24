import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Mocks must be hoisted; declare before importing the SUT.
vi.mock('@/lib/db/client', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn()
  }
}))
vi.mock('@/lib/square/client', () => ({
  getSquareClient: vi.fn()
}))

describe('denormalize', () => {
  it('projects itemOptions + optionValueIds from a Square SDK item', async () => {
    const { denormalize } = await import('@/lib/products/cache')

    const sdkItem = {
      id: 'ITEM_1',
      itemData: {
        name: 'Test Print',
        description: 'plain',
        descriptionHtml: '<p>plain</p>',
        categories: [{ id: 'CAT_1' }],
        imageIds: ['IMG_1'],
        itemOptions: [{ itemOptionId: 'OPT_SIZE' }, { itemOptionId: 'OPT_MEDIA' }],
        variations: [
          {
            id: 'VAR_1',
            itemVariationData: {
              name: 'Small / Acrylic',
              sku: 'TP-S-AC',
              pricingType: 'FIXED_PRICING',
              priceMoney: { amount: 2500, currency: 'USD' },
              itemOptionValues: [
                { itemOptionId: 'OPT_SIZE', itemOptionValueId: 'VAL_SM' },
                { itemOptionId: 'OPT_MEDIA', itemOptionValueId: 'VAL_AC' }
              ]
            }
          }
        ]
      }
    }

    const optionDefs = new Map([
      ['OPT_SIZE', { id: 'OPT_SIZE', name: 'Size', values: [{ id: 'VAL_SM', name: 'Small' }] }],
      ['OPT_MEDIA', { id: 'OPT_MEDIA', name: 'Media', values: [{ id: 'VAL_AC', name: 'Acrylic' }] }]
    ])
    const imageUrlById = new Map([['IMG_1', 'https://cdn.example/img1.jpg']])

    const product = denormalize(sdkItem, { optionDefs, imageUrlById })

    expect(product.id).toBe('ITEM_1')
    expect(product.itemOptions).toHaveLength(2)
    expect(product.itemOptions[0]).toEqual({
      id: 'OPT_SIZE',
      name: 'Size',
      values: [{ id: 'VAL_SM', name: 'Small' }]
    })
    expect(product.variations).toHaveLength(1)
    expect(product.variations[0].optionValueIds).toEqual(['VAL_SM', 'VAL_AC'])
    expect(product.variations[0].price).toEqual({ amount: 2500, currency: 'USD' })
    expect(product.images).toEqual(['https://cdn.example/img1.jpg'])
    expect(product.categoryIds).toEqual(['CAT_1'])
  })

  it('returns empty itemOptions + empty optionValueIds for items with no options', async () => {
    const { denormalize } = await import('@/lib/products/cache')

    const sdkItem = {
      id: 'ITEM_2',
      itemData: {
        name: 'Simple',
        categories: [],
        imageIds: [],
        variations: [
          {
            id: 'VAR_A',
            itemVariationData: {
              name: 'Default',
              pricingType: 'FIXED_PRICING',
              priceMoney: { amount: 1000, currency: 'USD' }
            }
          }
        ]
      }
    }

    const product = denormalize(sdkItem, {
      optionDefs: new Map(),
      imageUrlById: new Map()
    })

    expect(product.itemOptions).toEqual([])
    expect(product.variations[0].optionValueIds).toEqual([])
  })
})
