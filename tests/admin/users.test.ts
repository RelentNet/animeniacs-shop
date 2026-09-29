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

  it('filters banned vs active by view', async () => {
    const { PgDialect } = await import('drizzle-orm/pg-core')
    const { listUsers } = await import('@/lib/db/queries/users')
    const rendered = async (view?: 'active' | 'banned') => {
      mockDb.where
        .mockClear()
        .mockReturnValueOnce(mockDb)
        .mockResolvedValueOnce([{ n: 0 }])
      await listUsers({ view })
      return new PgDialect().sqlToQuery(mockDb.where.mock.calls[0][0])
    }
    const active = await rendered()
    expect(active.sql).toMatch(/"banned" = \$1/)
    expect(active.params[0]).toBe(false)
    expect((await rendered('banned')).params[0]).toBe(true)
  })

  it('rejects an invalid page size', async () => {
    const { listUsers } = await import('@/lib/db/queries/users')
    await expect(listUsers({ pageSize: 1000 })).rejects.toThrow()
  })
})

describe('getUserSummary', () => {
  it('returns the aggregate row', async () => {
    const row = { total: 10, last24h: 2, last7d: 5, banned: 1, noOrders: 7 }
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

describe('bulk ban/unban actions', () => {
  const mocks = vi.hoisted(() => ({
    updateUser: vi.fn(),
    deleteUserSessions: vi.fn(),
    getUsersByIds: vi.fn(),
    redirect: vi.fn((url: string) => {
      throw new Error(`REDIRECT:${url}`)
    })
  }))
  vi.mock('@/lib/auth', () => ({
    auth: {
      $context: Promise.resolve({
        internalAdapter: {
          updateUser: mocks.updateUser,
          deleteUserSessions: mocks.deleteUserSessions
        }
      })
    }
  }))
  vi.mock('@/lib/auth/get-current-user', () => ({
    getCurrentUser: async () => ({ isAuthenticated: true, roles: ['admin'], userId: 'me' })
  }))
  vi.mock('@/lib/db/queries/users', async (orig) => ({
    ...(await orig<object>()),
    getUserById: vi.fn(),
    getUsersByIds: mocks.getUsersByIds
  }))
  vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
  vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))

  const form = (ids: string[], reason = '') => {
    const f = new FormData()
    for (const id of ids) f.append('ids', id)
    f.set('reason', reason)
    return f
  }
  const notice = async (p: Promise<void>) =>
    decodeURIComponent(((await p.catch((e: Error) => e.message)) as string).split('notice=')[1])

  it('skips self/admins, bans the rest, revokes sessions, reports counts', async () => {
    mocks.getUsersByIds.mockResolvedValue([
      { id: 'u1', email: 'a@x.co', role: 'user', banned: false },
      { id: 'u2', email: 'b@x.co', role: 'user', banned: false },
      { id: 'a1', email: 'c@x.co', role: 'admin', banned: false },
      { id: 'me', email: 'me@x.co', role: 'user', banned: false }
    ])
    const { banSelectedAction } = await import('@/app/(admin)/admin/users/actions')
    const msg = await notice(banSelectedAction(form(['u1', 'u2', 'a1', 'me'], 'spam')))
    expect(msg).toBe('Banned 2 · skipped 2 (admin, self)')
    expect(mocks.updateUser).toHaveBeenCalledTimes(2)
    expect(mocks.updateUser).toHaveBeenCalledWith('u1', {
      banned: true,
      banReason: 'spam',
      banExpires: null
    })
    expect(mocks.deleteUserSessions).toHaveBeenCalledTimes(2)
  })

  it('rejects an empty or oversized selection and unbans without revoking', async () => {
    const { banSelectedAction, unbanSelectedAction } = await import(
      '@/app/(admin)/admin/users/actions'
    )
    expect(await notice(banSelectedAction(form([])))).toMatch(/Select 1-25/)
    expect(
      await notice(banSelectedAction(form(Array.from({ length: 26 }, (_, i) => `i${i}`))))
    ).toMatch(/Select 1-25/)
    mocks.updateUser.mockClear()
    mocks.deleteUserSessions.mockClear()
    mocks.getUsersByIds.mockResolvedValue([
      { id: 'u1', email: 'a@x.co', role: 'user', banned: true }
    ])
    expect(await notice(unbanSelectedAction(form(['u1'])))).toBe('Unbanned 1')
    expect(mocks.deleteUserSessions).not.toHaveBeenCalled()
  })
})
