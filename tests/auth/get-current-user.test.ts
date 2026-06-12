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

describe('deriveRoles (role column + ADMIN_EMAILS allowlist)', () => {
  it('grants admin from the role column', async () => {
    const { deriveRoles } = await import('@/lib/auth/get-current-user')
    expect(deriveRoles('admin', 'x@y.com', new Set())).toEqual(['admin'])
  })

  it('grants admin from the email allowlist regardless of role', async () => {
    const { deriveRoles } = await import('@/lib/auth/get-current-user')
    const allow = new Set(['biz@animeniacs.shop'])
    expect(deriveRoles('user', 'biz@animeniacs.shop', allow)).toEqual(['admin'])
  })

  it('matches the allowlist case-insensitively', async () => {
    const { deriveRoles } = await import('@/lib/auth/get-current-user')
    const allow = new Set(['biz@animeniacs.shop'])
    expect(deriveRoles('user', 'BIZ@Animeniacs.Shop', allow)).toEqual(['admin'])
  })

  it('returns [] for a non-admin, non-allowlisted user', async () => {
    const { deriveRoles } = await import('@/lib/auth/get-current-user')
    expect(deriveRoles('user', 'other@x.com', new Set(['biz@animeniacs.shop']))).toEqual([])
  })

  it('returns [] for a null email with an empty allowlist', async () => {
    const { deriveRoles } = await import('@/lib/auth/get-current-user')
    expect(deriveRoles(null, null, new Set())).toEqual([])
  })
})
