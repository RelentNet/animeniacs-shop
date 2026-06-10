import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoUpdate: vi.fn()
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
  mockDb.onConflictDoUpdate.mockReset().mockResolvedValue(undefined)
})

const newOrder = {
  squareOrderId: 'sq-1',
  userId: 'u1',
  status: 'completed' as const,
  totalCents: 1000,
  currency: 'USD',
  lineItems: []
}

describe('upsertOrder', () => {
  it('inserts then onConflictDoUpdate keyed on squareOrderId', async () => {
    const { upsertOrder } = await import('@/lib/db/queries/orders')
    await upsertOrder(newOrder)

    expect(mockDb.insert).toHaveBeenCalled()
    expect(mockDb.values).toHaveBeenCalledWith(expect.objectContaining({ squareOrderId: 'sq-1' }))
    const arg = mockDb.onConflictDoUpdate.mock.calls[0][0]
    expect(arg.set).toEqual(
      expect.objectContaining({ totalCents: 1000, updatedAt: expect.any(Date) })
    )
  })
})

describe('getOrdersForUser', () => {
  it('selects by userId ordered by placedAt desc', async () => {
    const rows = [{ id: 'o1', userId: 'u1' }]
    mockDb.orderBy.mockResolvedValue(rows)

    const { getOrdersForUser } = await import('@/lib/db/queries/orders')
    const result = await getOrdersForUser('u1')

    expect(result).toBe(rows)
    expect(mockDb.where).toHaveBeenCalled()
    expect(mockDb.orderBy).toHaveBeenCalled()
  })
})

describe('getOrderById', () => {
  it('returns the single row', async () => {
    mockDb.limit.mockResolvedValue([{ id: 'o1' }])
    const { getOrderById } = await import('@/lib/db/queries/orders')
    const result = await getOrderById('o1')
    expect(result).toEqual({ id: 'o1' })
  })

  it('returns undefined when not found', async () => {
    mockDb.limit.mockResolvedValue([])
    const { getOrderById } = await import('@/lib/db/queries/orders')
    const result = await getOrderById('missing')
    expect(result).toBeUndefined()
  })
})

describe('hasPurchasedProduct', () => {
  it('returns true when a completed order contains the product', async () => {
    mockDb.limit.mockResolvedValue([{ squareOrderId: 'sq-1' }])
    const { hasPurchasedProduct } = await import('@/lib/db/queries/orders')
    const result = await hasPurchasedProduct('u1', 'ITEM_A')
    expect(result).toBe(true)
    expect(mockDb.where).toHaveBeenCalled()
    expect(mockDb.limit).toHaveBeenCalledWith(1)
  })

  it('returns false when no matching order exists', async () => {
    mockDb.limit.mockResolvedValue([])
    const { hasPurchasedProduct } = await import('@/lib/db/queries/orders')
    const result = await hasPurchasedProduct('u1', 'ITEM_B')
    expect(result).toBe(false)
  })
})

describe('findPurchaseOrderId', () => {
  it('returns the matching squareOrderId', async () => {
    mockDb.limit.mockResolvedValue([{ squareOrderId: 'sq-42' }])
    const { findPurchaseOrderId } = await import('@/lib/db/queries/orders')
    const result = await findPurchaseOrderId('u1', 'ITEM_A')
    expect(result).toBe('sq-42')
  })

  it('returns null when no matching order exists', async () => {
    mockDb.limit.mockResolvedValue([])
    const { findPurchaseOrderId } = await import('@/lib/db/queries/orders')
    const result = await findPurchaseOrderId('u1', 'ITEM_B')
    expect(result).toBeNull()
  })
})
