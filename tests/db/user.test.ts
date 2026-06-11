import { beforeEach, describe, expect, it, vi } from 'vitest'

// Phase 15: the Square customer mapping lives on the user row. These query
// helpers (read/write user.squareCustomerId) replace the dropped customer_link
// queries. Chainable db mock: `limit` is terminal for the select path; `where`
// is terminal for the update path.
const mockDb = {
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  update: vi.fn(),
  set: vi.fn()
}

vi.mock('@/lib/db/client', () => ({ db: mockDb }))

beforeEach(() => {
  mockDb.select.mockReset().mockReturnThis()
  mockDb.from.mockReset().mockReturnThis()
  mockDb.where.mockReset().mockReturnThis()
  mockDb.limit.mockReset().mockResolvedValue([])
  mockDb.update.mockReset().mockReturnThis()
  mockDb.set.mockReset().mockReturnThis()
})

describe('getUserSquareCustomerId', () => {
  it('returns the squareCustomerId when the user has one', async () => {
    mockDb.limit.mockResolvedValue([{ squareCustomerId: 'sq_cust_1' }])

    const { getUserSquareCustomerId } = await import('@/lib/db/queries/user')
    const result = await getUserSquareCustomerId('u1')

    expect(result).toBe('sq_cust_1')
    expect(mockDb.select).toHaveBeenCalled()
  })

  it('returns null when the user has no mapping yet', async () => {
    mockDb.limit.mockResolvedValue([{ squareCustomerId: null }])

    const { getUserSquareCustomerId } = await import('@/lib/db/queries/user')
    expect(await getUserSquareCustomerId('u1')).toBeNull()
  })

  it('returns null when the user does not exist', async () => {
    mockDb.limit.mockResolvedValue([])

    const { getUserSquareCustomerId } = await import('@/lib/db/queries/user')
    expect(await getUserSquareCustomerId('missing')).toBeNull()
  })
})

describe('setUserSquareCustomerId', () => {
  it('updates the user row with the squareCustomerId', async () => {
    mockDb.where.mockResolvedValue(undefined)

    const { setUserSquareCustomerId } = await import('@/lib/db/queries/user')
    await setUserSquareCustomerId('u1', 'sq_new')

    expect(mockDb.update).toHaveBeenCalled()
    expect(mockDb.set).toHaveBeenCalledWith(
      expect.objectContaining({ squareCustomerId: 'sq_new', updatedAt: expect.any(Date) })
    )
    expect(mockDb.where).toHaveBeenCalled()
  })
})
