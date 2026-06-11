import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  groupBy: vi.fn(),
  limit: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  delete: vi.fn()
}

vi.mock('@/lib/db/client', () => ({ db: mockDb }))

beforeEach(() => {
  mockDb.select.mockReset().mockReturnThis()
  mockDb.from.mockReset().mockReturnThis()
  mockDb.where.mockReset().mockReturnThis()
  mockDb.orderBy.mockReset().mockResolvedValue([])
  mockDb.groupBy.mockReset().mockResolvedValue([])
  mockDb.limit.mockReset().mockResolvedValue([])
  mockDb.insert.mockReset().mockReturnThis()
  mockDb.values.mockReset().mockReturnThis()
  mockDb.returning.mockReset().mockResolvedValue([])
  mockDb.update.mockReset().mockReturnThis()
  mockDb.set.mockReset().mockReturnThis()
  mockDb.delete.mockReset().mockReturnThis()
})

const reviewInput = {
  id: 'r-1',
  productId: 'ITEM_A',
  userId: 'u1',
  orderId: 'sq-1',
  rating: 5,
  title: 'Great',
  body: 'Loved it',
  authorName: 'Dan',
  photoUrls: ['/images/uploads/review-photos/r-1-0.webp'],
  isVerifiedPurchase: true,
  isPublished: true
}

describe('createReview', () => {
  it('inserts and returns the row', async () => {
    const row = { ...reviewInput }
    mockDb.returning.mockResolvedValue([row])
    const { createReview } = await import('@/lib/db/queries/reviews')
    const result = await createReview(reviewInput)
    expect(result).toEqual(row)
    expect(mockDb.values).toHaveBeenCalledWith(expect.objectContaining({ id: 'r-1', rating: 5 }))
  })

  it('throws AlreadyReviewedError on a unique violation (23505)', async () => {
    mockDb.returning.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }))
    const { createReview, AlreadyReviewedError } = await import('@/lib/db/queries/reviews')
    await expect(createReview(reviewInput)).rejects.toBeInstanceOf(AlreadyReviewedError)
  })

  it('rethrows other DB errors unchanged', async () => {
    mockDb.returning.mockRejectedValue(Object.assign(new Error('boom'), { code: '42P01' }))
    const { createReview } = await import('@/lib/db/queries/reviews')
    await expect(createReview(reviewInput)).rejects.toThrow('boom')
  })
})

describe('getPublishedReviewsForProduct', () => {
  it('filters published, ordered by createdAt desc', async () => {
    const rows = [{ id: 'r-1', isPublished: true }]
    mockDb.orderBy.mockResolvedValue(rows)
    const { getPublishedReviewsForProduct } = await import('@/lib/db/queries/reviews')
    const result = await getPublishedReviewsForProduct('ITEM_A')
    expect(result).toBe(rows)
    expect(mockDb.where).toHaveBeenCalled()
    expect(mockDb.orderBy).toHaveBeenCalled()
  })
})

describe('getReviewSummary', () => {
  it('returns count + average over published reviews', async () => {
    mockDb.where.mockResolvedValue([{ count: 2, average: 4.5 }])
    const { getReviewSummary } = await import('@/lib/db/queries/reviews')
    const result = await getReviewSummary('ITEM_A')
    expect(result).toEqual({ count: 2, average: 4.5 })
  })

  it('returns { count: 0, average: 0 } when there are no reviews', async () => {
    mockDb.where.mockResolvedValue([{ count: 0, average: null }])
    const { getReviewSummary } = await import('@/lib/db/queries/reviews')
    const result = await getReviewSummary('ITEM_A')
    expect(result).toEqual({ count: 0, average: 0 })
  })
})

describe('getReviewSummariesForProducts', () => {
  it('returns an empty map (without querying) for empty input', async () => {
    const { getReviewSummariesForProducts } = await import('@/lib/db/queries/reviews')
    const result = await getReviewSummariesForProducts([])
    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(0)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it('groups published-only counts + averages by product id', async () => {
    mockDb.groupBy.mockResolvedValue([
      { productId: 'p1', count: 2, average: '4.5' },
      { productId: 'p2', count: 1, average: '3' }
    ])
    const { getReviewSummariesForProducts } = await import('@/lib/db/queries/reviews')
    const result = await getReviewSummariesForProducts(['p1', 'p2', 'p3'])
    expect(result.get('p1')).toEqual({ count: 2, average: 4.5 })
    expect(result.get('p2')).toEqual({ count: 1, average: 3 })
    // p3 has no published reviews → absent from the map
    expect(result.has('p3')).toBe(false)
    expect(mockDb.groupBy).toHaveBeenCalled()
  })
})

describe('getUserReviewForProduct', () => {
  it('returns the user row when present', async () => {
    mockDb.limit.mockResolvedValue([{ id: 'r-1', userId: 'u1' }])
    const { getUserReviewForProduct } = await import('@/lib/db/queries/reviews')
    const result = await getUserReviewForProduct('u1', 'ITEM_A')
    expect(result).toEqual({ id: 'r-1', userId: 'u1' })
  })

  it('returns undefined when the user has not reviewed', async () => {
    mockDb.limit.mockResolvedValue([])
    const { getUserReviewForProduct } = await import('@/lib/db/queries/reviews')
    const result = await getUserReviewForProduct('u1', 'ITEM_A')
    expect(result).toBeUndefined()
  })
})

describe('getPendingReviews', () => {
  it('returns unpublished reviews ordered by createdAt desc', async () => {
    const rows = [{ id: 'r-2', isPublished: false }]
    mockDb.orderBy.mockResolvedValue(rows)
    const { getPendingReviews } = await import('@/lib/db/queries/reviews')
    const result = await getPendingReviews()
    expect(result).toBe(rows)
    expect(mockDb.where).toHaveBeenCalled()
  })
})

describe('publishReview', () => {
  it('sets isPublished true + updatedAt', async () => {
    const { publishReview } = await import('@/lib/db/queries/reviews')
    await publishReview('r-2')
    expect(mockDb.update).toHaveBeenCalled()
    const setArg = mockDb.set.mock.calls[0][0]
    expect(setArg).toEqual(
      expect.objectContaining({ isPublished: true, updatedAt: expect.any(Date) })
    )
    expect(mockDb.where).toHaveBeenCalled()
  })
})

describe('deleteReview', () => {
  it('deletes by id', async () => {
    const { deleteReview } = await import('@/lib/db/queries/reviews')
    await deleteReview('r-2')
    expect(mockDb.delete).toHaveBeenCalled()
    expect(mockDb.where).toHaveBeenCalled()
  })
})
