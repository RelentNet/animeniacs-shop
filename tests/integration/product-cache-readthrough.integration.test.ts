import { db } from '@/lib/db/client'
import { productCache } from '@/lib/db/schema'
import {
  PRODUCT_CACHE_TTL_MS,
  __forceRefresh,
  getProductById
} from '@/lib/products/cache'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { testNamespace } from '../helpers/db'

const NS = testNamespace('pcache')

// Mock the Square client at module level. Each test sets `mockGet` to control
// the response.
const mockGet = vi.fn()
vi.mock('@/lib/square/client', () => ({
  getSquareClient: () => ({ catalog: { object: { get: mockGet } } })
}))

function sdkResponse(itemId: string, name = 'Test Item') {
  return {
    object: {
      id: itemId,
      type: 'ITEM',
      updatedAt: '2026-05-22T00:00:00Z',
      itemData: {
        name,
        description: null,
        descriptionHtml: null,
        categories: [],
        imageIds: [],
        variations: []
      }
    },
    relatedObjects: []
  }
}

afterAll(async () => {
  await db.delete(productCache).where(sql`${productCache.catalogItemId} LIKE ${`${NS}%`}`)
})

beforeEach(() => {
  mockGet.mockReset()
})

describe('getProductById read-through cache (integration)', () => {
  it('cold cache → calls Square → writes row → second call reads from cache', async () => {
    const id = `${NS}_cold`
    mockGet.mockResolvedValueOnce(sdkResponse(id, 'Cold'))

    const first = await getProductById(id)
    expect(first?.name).toBe('Cold')
    expect(mockGet).toHaveBeenCalledTimes(1)

    const rows = await db.select().from(productCache).where(eq(productCache.catalogItemId, id))
    expect(rows).toHaveLength(1)

    const second = await getProductById(id)
    expect(second?.name).toBe('Cold')
    expect(mockGet).toHaveBeenCalledTimes(1) // no second Square call
  })

  it('stale row past TTL → re-fetches and overwrites', async () => {
    const id = `${NS}_stale`
    mockGet.mockResolvedValueOnce(sdkResponse(id, 'Old'))
    await getProductById(id)

    // Push updated_at back further than the TTL.
    const olderThanTtl = new Date(Date.now() - PRODUCT_CACHE_TTL_MS - 1000)
    await db
      .update(productCache)
      .set({ updatedAt: olderThanTtl })
      .where(eq(productCache.catalogItemId, id))

    mockGet.mockResolvedValueOnce(sdkResponse(id, 'New'))
    const refreshed = await getProductById(id)
    expect(refreshed?.name).toBe('New')
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  it('Square returns not-found → returns null without writing cache', async () => {
    const id = `${NS}_missing`
    mockGet.mockResolvedValueOnce({ object: null })
    const result = await getProductById(id)
    expect(result).toBeNull()
    const rows = await db.select().from(productCache).where(eq(productCache.catalogItemId, id))
    expect(rows).toHaveLength(0)
  })

  it('Square throws → returns null and does not pollute cache', async () => {
    const id = `${NS}_throw`
    mockGet.mockRejectedValueOnce(new Error('boom'))
    const result = await getProductById(id)
    expect(result).toBeNull()
    const rows = await db.select().from(productCache).where(eq(productCache.catalogItemId, id))
    expect(rows).toHaveLength(0)
  })

  it('__forceRefresh drops the row', async () => {
    const id = `${NS}_force`
    mockGet.mockResolvedValueOnce(sdkResponse(id, 'A'))
    await getProductById(id)
    await __forceRefresh(id)
    const rows = await db.select().from(productCache).where(eq(productCache.catalogItemId, id))
    expect(rows).toHaveLength(0)
  })
})
