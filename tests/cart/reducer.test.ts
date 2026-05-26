import { cartReducer, totalQuantity } from '@/lib/cart/reducer'
import { type CartEntry, type CartState, INITIAL_CART_STATE } from '@/lib/cart/types'
import { describe, expect, it } from 'vitest'

function entry(over: Partial<CartEntry> = {}): CartEntry {
  return {
    catalogItemId: 'ITEM_A',
    variationId: 'VAR_A',
    quantity: 1,
    addedAt: '2026-05-24T00:00:00.000Z',
    ...over
  }
}

function stateWith(items: CartEntry[]): CartState {
  return { ...INITIAL_CART_STATE, items, isHydrated: true }
}

describe('cartReducer', () => {
  describe('HYDRATE', () => {
    it('replaces items and sets isHydrated=true', () => {
      const next = cartReducer(INITIAL_CART_STATE, {
        type: 'HYDRATE',
        items: [entry()]
      })
      expect(next.items).toEqual([entry()])
      expect(next.isHydrated).toBe(true)
    })

    it('preserves drawer open state', () => {
      const start: CartState = { ...INITIAL_CART_STATE, isDrawerOpen: true }
      const next = cartReducer(start, { type: 'HYDRATE', items: [] })
      expect(next.isDrawerOpen).toBe(true)
    })
  })

  describe('ADD_ITEM', () => {
    it('appends a new entry with fresh addedAt when no match exists', () => {
      const next = cartReducer(stateWith([]), {
        type: 'ADD_ITEM',
        entry: { catalogItemId: 'A', variationId: 'V', quantity: 2 }
      })
      expect(next.items).toHaveLength(1)
      expect(next.items[0].quantity).toBe(2)
      expect(typeof next.items[0].addedAt).toBe('string')
    })

    it('merges quantity when (catalogItemId, variationId) already exists', () => {
      const existing = entry({ quantity: 1 })
      const next = cartReducer(stateWith([existing]), {
        type: 'ADD_ITEM',
        entry: {
          catalogItemId: existing.catalogItemId,
          variationId: existing.variationId,
          quantity: 3
        }
      })
      expect(next.items).toHaveLength(1)
      expect(next.items[0].quantity).toBe(4)
    })

    it('does NOT bump addedAt on merge', () => {
      const existing = entry({ addedAt: '2026-01-01T00:00:00.000Z' })
      const next = cartReducer(stateWith([existing]), {
        type: 'ADD_ITEM',
        entry: {
          catalogItemId: existing.catalogItemId,
          variationId: existing.variationId,
          quantity: 1
        }
      })
      expect(next.items[0].addedAt).toBe('2026-01-01T00:00:00.000Z')
    })

    it('treats different variations as separate lines', () => {
      const existing = entry({ variationId: 'V_SMALL' })
      const next = cartReducer(stateWith([existing]), {
        type: 'ADD_ITEM',
        entry: { catalogItemId: existing.catalogItemId, variationId: 'V_LARGE', quantity: 1 }
      })
      expect(next.items).toHaveLength(2)
    })
  })

  describe('REMOVE_ITEM', () => {
    it('removes the matching entry', () => {
      const a = entry({ catalogItemId: 'A', variationId: 'V' })
      const b = entry({ catalogItemId: 'B', variationId: 'V' })
      const next = cartReducer(stateWith([a, b]), {
        type: 'REMOVE_ITEM',
        catalogItemId: 'A',
        variationId: 'V'
      })
      expect(next.items).toEqual([b])
    })

    it('is idempotent when entry does not exist', () => {
      const next = cartReducer(stateWith([entry()]), {
        type: 'REMOVE_ITEM',
        catalogItemId: 'NOPE',
        variationId: 'NOPE'
      })
      expect(next.items).toHaveLength(1)
    })
  })

  describe('SET_QUANTITY', () => {
    it('sets the quantity on the matching entry', () => {
      const next = cartReducer(stateWith([entry({ quantity: 1 })]), {
        type: 'SET_QUANTITY',
        catalogItemId: 'ITEM_A',
        variationId: 'VAR_A',
        quantity: 5
      })
      expect(next.items[0].quantity).toBe(5)
    })

    it('removes the entry when quantity <= 0', () => {
      const next = cartReducer(stateWith([entry({ quantity: 3 })]), {
        type: 'SET_QUANTITY',
        catalogItemId: 'ITEM_A',
        variationId: 'VAR_A',
        quantity: 0
      })
      expect(next.items).toHaveLength(0)
    })

    it('removes the entry when quantity is negative', () => {
      const next = cartReducer(stateWith([entry({ quantity: 3 })]), {
        type: 'SET_QUANTITY',
        catalogItemId: 'ITEM_A',
        variationId: 'VAR_A',
        quantity: -2
      })
      expect(next.items).toHaveLength(0)
    })
  })

  describe('CLEAR', () => {
    it('empties items', () => {
      const next = cartReducer(stateWith([entry(), entry({ catalogItemId: 'B' })]), {
        type: 'CLEAR'
      })
      expect(next.items).toEqual([])
    })

    it('preserves drawer state', () => {
      const start = { ...stateWith([entry()]), isDrawerOpen: true }
      const next = cartReducer(start, { type: 'CLEAR' })
      expect(next.isDrawerOpen).toBe(true)
    })
  })

  describe('drawer actions', () => {
    it('OPEN_DRAWER sets isDrawerOpen=true', () => {
      const next = cartReducer(INITIAL_CART_STATE, { type: 'OPEN_DRAWER' })
      expect(next.isDrawerOpen).toBe(true)
    })

    it('CLOSE_DRAWER sets isDrawerOpen=false', () => {
      const start = { ...INITIAL_CART_STATE, isDrawerOpen: true }
      const next = cartReducer(start, { type: 'CLOSE_DRAWER' })
      expect(next.isDrawerOpen).toBe(false)
    })

    it('drawer actions do not touch items', () => {
      const start = stateWith([entry()])
      const next = cartReducer(start, { type: 'OPEN_DRAWER' })
      expect(next.items).toBe(start.items) // same reference is fine
    })
  })
})

describe('totalQuantity', () => {
  it('returns 0 for empty items', () => {
    expect(totalQuantity([])).toBe(0)
  })

  it('sums quantities across entries', () => {
    expect(
      totalQuantity([
        { catalogItemId: 'A', variationId: 'V', quantity: 2, addedAt: '' },
        { catalogItemId: 'B', variationId: 'V', quantity: 3, addedAt: '' }
      ])
    ).toBe(5)
  })
})
