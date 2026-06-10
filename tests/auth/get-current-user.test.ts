import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetLogtoContext = vi.fn()

vi.mock('@logto/next/server-actions', () => ({ getLogtoContext: mockGetLogtoContext }))
vi.mock('@/lib/logto', () => ({ logtoConfig: {} }))

describe('getCurrentUser', () => {
  beforeEach(() => {
    mockGetLogtoContext.mockReset()
  })

  it('returns authenticated claims when signed in', async () => {
    mockGetLogtoContext.mockResolvedValue({
      isAuthenticated: true,
      claims: { sub: 'user-123', email: 'buyer@example.com', name: 'Ada', roles: ['admin'] }
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

  it('returns an unauthenticated shape when not signed in', async () => {
    mockGetLogtoContext.mockResolvedValue({ isAuthenticated: false, claims: null })

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

  it('defaults roles to [] and missing fields to null when authenticated with sparse claims', async () => {
    mockGetLogtoContext.mockResolvedValue({
      isAuthenticated: true,
      claims: { sub: 'user-456' }
    })

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

  it('returns an unauthenticated shape when getLogtoContext throws', async () => {
    mockGetLogtoContext.mockRejectedValue(new Error('no session'))

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
