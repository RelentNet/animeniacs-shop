import { beforeEach, describe, expect, it, vi } from 'vitest'

// Chainable db mock. For the select path, `limit` is terminal; for the upsert
// path, `onConflictDoUpdate` is terminal.
const mockDb = {
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
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
  mockDb.limit.mockReset().mockResolvedValue([])
  mockDb.insert.mockReset().mockReturnThis()
  mockDb.values.mockReset().mockReturnThis()
  mockDb.onConflictDoUpdate.mockReset().mockResolvedValue(undefined)
})

describe('getCustomerLinkByUserId', () => {
  it('returns the row for a userId', async () => {
    const row = {
      userId: 'u1',
      email: 'u1@example.com',
      squareCustomerId: 'sq_cust_1',
      name: 'Ada',
      cachedAt: new Date()
    }
    mockDb.limit.mockResolvedValue([row])

    const { getCustomerLinkByUserId } = await import('@/lib/db/queries/customer-link')
    const result = await getCustomerLinkByUserId('u1')

    expect(result).toEqual(row)
    expect(mockDb.select).toHaveBeenCalled()
  })

  it('returns undefined when no row matches', async () => {
    mockDb.limit.mockResolvedValue([])

    const { getCustomerLinkByUserId } = await import('@/lib/db/queries/customer-link')
    const result = await getCustomerLinkByUserId('missing')

    expect(result).toBeUndefined()
  })
})

describe('upsertCustomerLink', () => {
  it('inserts then onConflictDoUpdate keyed on userId', async () => {
    const { upsertCustomerLink } = await import('@/lib/db/queries/customer-link')
    await upsertCustomerLink({
      userId: 'u1',
      email: 'u1@example.com',
      squareCustomerId: 'sq_cust_1',
      name: 'Ada'
    })

    expect(mockDb.insert).toHaveBeenCalled()
    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        email: 'u1@example.com',
        squareCustomerId: 'sq_cust_1',
        name: 'Ada'
      })
    )
    expect(mockDb.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          email: 'u1@example.com',
          squareCustomerId: 'sq_cust_1',
          name: 'Ada',
          cachedAt: expect.any(Date)
        })
      })
    )
  })
})
