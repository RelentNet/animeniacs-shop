import { beforeEach, describe, expect, it, vi } from 'vitest'

// getCurrentUser is now backed by better-auth's `auth.api.getSession` (Phase 15,
// was the old OIDC context). The CurrentUser interface is unchanged so the
// ~13 consumers don't churn: userId = user.id; roles = role==='admin'?['admin']:[].
const mockGetSession = vi.fn()

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mockGetSession } } }))
vi.mock('next/headers', () => ({ headers: () => new Headers() }))

describe('getCurrentUser', () => {
  beforeEach(() => {
    mockGetSession.mockReset()
  })

  it('maps an admin session to roles:[admin]', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'user-123', email: 'buyer@example.com', name: 'Ada', role: 'admin' }
    })

    const { getCurrentUser } = await import('@/lib/auth/get-current-user')
    const result = await getCurrentUser()

    expect(result).toEqual({
      isAuthenticated: true,
      userId: 'user-123',
      email: 'buyer@example.com',
      name: 'Ada',
      roles: ['admin']
    })
  })

  it('maps a non-admin session to roles:[]', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'user-9', email: 'c@example.com', name: 'Cee', role: 'user' }
    })

    const { getCurrentUser } = await import('@/lib/auth/get-current-user')
    const result = await getCurrentUser()

    expect(result).toEqual({
      isAuthenticated: true,
      userId: 'user-9',
      email: 'c@example.com',
      name: 'Cee',
      roles: []
    })
  })

  it('returns an unauthenticated shape when there is no session', async () => {
    mockGetSession.mockResolvedValue(null)

    const { getCurrentUser } = await import('@/lib/auth/get-current-user')
    const result = await getCurrentUser()

    expect(result).toEqual({
      isAuthenticated: false,
      userId: null,
      email: null,
      name: null,
      roles: []
    })
  })

  it('defaults missing name/email to null and absent role to roles:[]', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-456' } })

    const { getCurrentUser } = await import('@/lib/auth/get-current-user')
    const result = await getCurrentUser()

    expect(result).toEqual({
      isAuthenticated: true,
      userId: 'user-456',
      email: null,
      name: null,
      roles: []
    })
  })

  it('returns an unauthenticated shape when getSession throws', async () => {
    mockGetSession.mockRejectedValue(new Error('no session'))

    const { getCurrentUser } = await import('@/lib/auth/get-current-user')
    const result = await getCurrentUser()

    expect(result).toEqual({
      isAuthenticated: false,
      userId: null,
      email: null,
      name: null,
      roles: []
    })
  })
})
