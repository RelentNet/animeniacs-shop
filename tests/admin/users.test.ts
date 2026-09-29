import { beforeEach, describe, expect, it, vi } from 'vitest'

// Chainable db mock; each query awaits a different terminal call.
const mockDb = {
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  offset: vi.fn()
}
vi.mock('@/lib/db/client', () => ({ db: mockDb }))
vi.mock('server-only', () => ({}))

beforeEach(() => {
  for (const k of ['select', 'from', 'orderBy', 'limit'] as const)
    mockDb[k].mockReset().mockReturnThis()
  mockDb.where.mockReset().mockReturnThis()
  mockDb.offset.mockReset().mockResolvedValue([{ id: 'u1', email: 'a@b.co' }])
})

describe('listUsers', () => {
  it('paginates, sorts newest first, and returns the total', async () => {
    // 1st where() (rows) chains on; 2nd (count) resolves.
    mockDb.where.mockReturnValueOnce(mockDb).mockResolvedValueOnce([{ n: 51 }])
    const { listUsers } = await import('@/lib/db/queries/users')
    const res = await listUsers({ q: 'a_b', page: 3, pageSize: 25 })
    expect(mockDb.orderBy).toHaveBeenCalledTimes(1)
    expect(mockDb.limit).toHaveBeenCalledWith(25)
    expect(mockDb.offset).toHaveBeenCalledWith(50)
    expect(res).toMatchObject({ total: 51, page: 3, rows: [{ id: 'u1' }] })
  })

  it('rejects an invalid page size', async () => {
    const { listUsers } = await import('@/lib/db/queries/users')
    await expect(listUsers({ pageSize: 1000 })).rejects.toThrow()
  })
})

describe('getUserSummary', () => {
  it('returns the aggregate row', async () => {
    const row = { total: 10, last24h: 2, last7d: 5, noOrders: 7 }
    mockDb.from.mockResolvedValueOnce([row])
    const { getUserSummary } = await import('@/lib/db/queries/users')
    await expect(getUserSummary()).resolves.toEqual(row)
  })
})

describe('banBlockReason', () => {
  const admins = new Set(['boss@shop.com'])
  it('blocks self, allowlisted and role=admin targets; allows others', async () => {
    const { banBlockReason } = await import('@/lib/admin/ban-guard')
    expect(banBlockReason('u1', { id: 'u1', email: 'x@y.z' }, admins)).toMatch(/yourself/)
    expect(banBlockReason('u9', { id: 'u2', email: 'Boss@Shop.com' }, admins)).toMatch(/Admin/)
    expect(banBlockReason('u9', { id: 'u3', email: 'x@y.z', role: 'admin' }, admins)).toMatch(
      /Admin/
    )
    expect(banBlockReason('u9', { id: 'u4', email: 'x@y.z', role: 'user' }, admins)).toBeNull()
  })
})
