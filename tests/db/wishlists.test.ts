import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  delete: vi.fn()
}

vi.mock('@/lib/db/client', () => ({ db: mockDb }))

beforeEach(() => {
  mockDb.select.mockReset().mockReturnThis()
  mockDb.from.mockReset().mockReturnThis()
  mockDb.where.mockReset().mockReturnThis()
  mockDb.orderBy.mockReset().mockResolvedValue([])
  mockDb.limit.mockReset().mockResolvedValue([])
  mockDb.insert.mockReset().mockReturnThis()
  mockDb.values.mockReset().mockReturnThis()
  mockDb.onConflictDoNothing.mockReset().mockResolvedValue(undefined)
  mockDb.delete.mockReset().mockReturnThis()
})

describe('addToWishlist', () => {
  it('inserts the pair and ignores conflicts (idempotent)', async () => {
    const { addToWishlist } = await import('@/lib/db/queries/wishlists')
    await addToWishlist('u1', 'ITEM_A')
    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', productId: 'ITEM_A' })
    )
    expect(mockDb.onConflictDoNothing).toHaveBeenCalled()
  })
})

describe('removeFromWishlist', () => {
  it('deletes on the composite key', async () => {
    const { removeFromWishlist } = await import('@/lib/db/queries/wishlists')
    await removeFromWishlist('u1', 'ITEM_A')
    expect(mockDb.delete).toHaveBeenCalled()
    expect(mockDb.where).toHaveBeenCalled()
  })
})

describe('getWishlist', () => {
  it('returns rows ordered by addedAt desc', async () => {
    const rows = [{ userId: 'u1', productId: 'ITEM_A' }]
    mockDb.orderBy.mockResolvedValue(rows)
    const { getWishlist } = await import('@/lib/db/queries/wishlists')
    const result = await getWishlist('u1')
    expect(result).toBe(rows)
    expect(mockDb.where).toHaveBeenCalled()
    expect(mockDb.orderBy).toHaveBeenCalled()
  })
})

describe('isInWishlist', () => {
  it('returns true when a row exists', async () => {
    mockDb.limit.mockResolvedValue([{ userId: 'u1', productId: 'ITEM_A' }])
    const { isInWishlist } = await import('@/lib/db/queries/wishlists')
    expect(await isInWishlist('u1', 'ITEM_A')).toBe(true)
  })

  it('returns false when no row exists', async () => {
    mockDb.limit.mockResolvedValue([])
    const { isInWishlist } = await import('@/lib/db/queries/wishlists')
    expect(await isInWishlist('u1', 'ITEM_B')).toBe(false)
  })
})
