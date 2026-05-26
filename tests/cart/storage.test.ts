import {
  CART_STORAGE_KEY,
  MAX_PERSISTED_ENTRIES,
  readPersistedCart,
  writePersistedCart
} from '@/lib/cart/storage'
import type { CartEntry } from '@/lib/cart/types'
import { beforeEach, describe, expect, it } from 'vitest'

function entry(over: Partial<CartEntry> = {}): CartEntry {
  return {
    catalogItemId: 'A',
    variationId: 'V',
    quantity: 1,
    addedAt: '2026-05-24T00:00:00.000Z',
    ...over
  }
}

describe('readPersistedCart', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns [] when key is missing', () => {
    expect(readPersistedCart()).toEqual([])
  })

  it('returns [] when value is not valid JSON', () => {
    localStorage.setItem(CART_STORAGE_KEY, '<not json>')
    expect(readPersistedCart()).toEqual([])
  })

  it('returns [] when value does not match schema', () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([{ wrong: 'shape' }]))
    expect(readPersistedCart()).toEqual([])
  })

  it('returns parsed entries on a valid payload', () => {
    const items = [entry()]
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
    expect(readPersistedCart()).toEqual(items)
  })

  it('returns [] when localStorage is unavailable', () => {
    const original = global.localStorage
    // Simulate unavailable localStorage (e.g. SSR or private mode that throws on getItem)
    Object.defineProperty(global, 'localStorage', {
      get() {
        throw new Error('unavailable')
      },
      configurable: true
    })
    try {
      expect(readPersistedCart()).toEqual([])
    } finally {
      Object.defineProperty(global, 'localStorage', { value: original, configurable: true })
    }
  })
})

describe('writePersistedCart', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('writes serialized entries to the key', () => {
    const items = [entry()]
    writePersistedCart(items)
    expect(JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? '[]')).toEqual(items)
  })

  it('truncates to MAX_PERSISTED_ENTRIES oldest-first', () => {
    const items: CartEntry[] = Array.from({ length: MAX_PERSISTED_ENTRIES + 5 }, (_, i) =>
      entry({
        catalogItemId: `ITEM_${i}`,
        addedAt: new Date(2026, 0, 1, 0, 0, i).toISOString()
      })
    )
    writePersistedCart(items)
    const written = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? '[]') as CartEntry[]
    expect(written).toHaveLength(MAX_PERSISTED_ENTRIES)
    // The oldest entries (lowest seconds) should be the ones dropped.
    expect(written[0].catalogItemId).not.toBe('ITEM_0')
    expect(written[written.length - 1].catalogItemId).toBe(`ITEM_${MAX_PERSISTED_ENTRIES + 4}`)
  })

  it('does not throw when localStorage is unavailable', () => {
    const original = global.localStorage
    Object.defineProperty(global, 'localStorage', {
      get() {
        throw new Error('unavailable')
      },
      configurable: true
    })
    try {
      expect(() => writePersistedCart([entry()])).not.toThrow()
    } finally {
      Object.defineProperty(global, 'localStorage', { value: original, configurable: true })
    }
  })
})
