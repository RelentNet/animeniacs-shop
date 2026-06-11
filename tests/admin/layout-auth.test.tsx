import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Phase 15: the (admin) gate now reads better-auth via getCurrentUser (was the
// old OIDC context). roles is derived from the user `role` column. When the user
// isn't an admin we distinguish "no admin exists yet" (provisioning hint) from
// "you're not an admin" (403), so the operator isn't hard-locked after migration.

const getCurrentUserMock = vi.fn()
vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args)
}))

const hasAnyAdminMock = vi.fn()
vi.mock('@/lib/db/queries/user', () => ({
  hasAnyAdmin: (...args: unknown[]) => hasAnyAdminMock(...args)
}))

const redirectMock = vi.fn((path: string) => {
  throw new Error(`__REDIRECT__:${path}`)
})
vi.mock('next/navigation', () => ({ redirect: redirectMock }))

async function loadLayout() {
  const mod = await import('@/app/(admin)/layout')
  return mod.default
}

describe('(admin) route group auth gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: an admin already exists, so non-admins get a hard 403.
    hasAnyAdminMock.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('redirects to /sign-in when the request is unauthenticated', async () => {
    getCurrentUserMock.mockResolvedValue({ isAuthenticated: false, roles: [] })
    const Layout = await loadLayout()
    await expect(Layout({ children: <div>child</div> })).rejects.toThrow('__REDIRECT__:/sign-in')
    expect(redirectMock).toHaveBeenCalledWith('/sign-in')
  })

  it('renders 403 when authenticated but lacking the admin role (an admin exists)', async () => {
    getCurrentUserMock.mockResolvedValue({ isAuthenticated: true, roles: [], userId: 'u-1' })
    const Layout = await loadLayout()
    const element = await Layout({ children: <div>secret</div> })
    const { container } = render(element)
    expect(container.textContent).toMatch(/403/i)
    expect(container.textContent).toMatch(/admin role required/i)
    expect(container.textContent).not.toMatch(/secret/)
  })

  it('renders a provisioning hint (not 403) when no admin exists yet', async () => {
    getCurrentUserMock.mockResolvedValue({ isAuthenticated: true, roles: [], userId: 'u-1' })
    hasAnyAdminMock.mockResolvedValue(false)
    const Layout = await loadLayout()
    const element = await Layout({ children: <div>secret</div> })
    const { container } = render(element)
    expect(container.textContent).toMatch(/no admin/i)
    expect(container.textContent).toMatch(/auth:grant-admin/i)
    expect(container.textContent).not.toMatch(/secret/)
  })

  it('renders children when the user has the admin role', async () => {
    getCurrentUserMock.mockResolvedValue({
      isAuthenticated: true,
      roles: ['admin'],
      userId: 'u-1'
    })
    const Layout = await loadLayout()
    const element = await Layout({ children: <div>admin-only content</div> })
    const { container, getByText } = render(element)
    expect(getByText('admin-only content')).toBeTruthy()
    expect(container.querySelector('.admin-shell')).toBeTruthy()
    // A signed-in admin never triggers the "no admin" lookup.
    expect(hasAnyAdminMock).not.toHaveBeenCalled()
  })
})
