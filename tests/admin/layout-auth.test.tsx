import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Module mocks ----
//
// The layout reads `getLogtoContext` from `@logto/next/server-actions`
// and `redirect` from `next/navigation`. Both need to be mockable per
// test so we can drive the three auth branches independently.

const getLogtoContextMock = vi.fn()
vi.mock('@logto/next/server-actions', () => ({
  getLogtoContext: (...args: unknown[]) => getLogtoContextMock(...args)
}))

const redirectMock = vi.fn((path: string) => {
  // Match Next.js's behaviour: `redirect()` throws a special error
  // that aborts rendering. We approximate by throwing here so the
  // calling code's control flow terminates the same way.
  throw new Error(`__REDIRECT__:${path}`)
})
vi.mock('next/navigation', () => ({
  redirect: redirectMock
}))

const isLogtoConfiguredMock = vi.fn()
vi.mock('@/lib/logto', () => ({
  // logtoConfig is opaque to the layout — any non-undefined value works.
  logtoConfig: { __test: true },
  isLogtoConfigured: () => isLogtoConfiguredMock()
}))

// Import AFTER the mocks are registered so the layout picks them up.
async function loadLayout() {
  const mod = await import('@/app/(admin)/layout')
  return mod.default
}

describe('(admin) route group auth gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: Logto IS configured. Individual tests can override.
    isLogtoConfiguredMock.mockReturnValue(true)
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('renders the setup-required screen when Logto is not configured', async () => {
    isLogtoConfiguredMock.mockReturnValue(false)
    const Layout = await loadLayout()
    const element = await Layout({ children: <div>child</div> })
    const { container } = render(element)
    expect(container.textContent).toMatch(/Logto not yet configured/i)
    expect(container.textContent).toMatch(/logto-setup\.md/)
    // getLogtoContext must NOT be called when config is missing —
    // otherwise the SDK crashes on empty credentials.
    expect(getLogtoContextMock).not.toHaveBeenCalled()
  })

  it('redirects to /sign-in when the request is unauthenticated', async () => {
    getLogtoContextMock.mockResolvedValue({ isAuthenticated: false })
    const Layout = await loadLayout()
    await expect(Layout({ children: <div>child</div> })).rejects.toThrow('__REDIRECT__:/sign-in')
    expect(redirectMock).toHaveBeenCalledWith('/sign-in')
  })

  it('renders 403 when the user is authenticated but lacks the admin role', async () => {
    getLogtoContextMock.mockResolvedValue({
      isAuthenticated: true,
      claims: { sub: 'u-1', roles: ['member'] }
    })
    const Layout = await loadLayout()
    const element = await Layout({ children: <div>secret</div> })
    const { container } = render(element)
    expect(container.textContent).toMatch(/403/i)
    expect(container.textContent).toMatch(/admin role required/i)
    expect(container.textContent).not.toMatch(/secret/)
  })

  it('renders 403 when claims has no roles array at all', async () => {
    getLogtoContextMock.mockResolvedValue({
      isAuthenticated: true,
      claims: { sub: 'u-1' }
    })
    const Layout = await loadLayout()
    const element = await Layout({ children: <div>secret</div> })
    const { container } = render(element)
    expect(container.textContent).toMatch(/403/i)
  })

  it('renders children when the user has the admin role', async () => {
    getLogtoContextMock.mockResolvedValue({
      isAuthenticated: true,
      claims: { sub: 'u-1', roles: ['admin', 'member'] }
    })
    const Layout = await loadLayout()
    const element = await Layout({ children: <div>admin-only content</div> })
    const { container } = render(element)
    expect(container.textContent).toBe('admin-only content')
  })
})
