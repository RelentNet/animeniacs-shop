import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetCurrentUser = vi.fn()
const mockGetAddresses = vi.fn().mockResolvedValue([])

vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock('@/lib/db/queries/addresses', () => ({
  getAddresses: mockGetAddresses
}))

// useFormState from react-dom is undefined under the jsdom/SSR transform these
// unit tests run in (same harness adaptation as the Phase 9 settings-page test).
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return { ...actual, useFormState: () => [{}, () => {}] }
})

beforeEach(() => {
  mockGetCurrentUser.mockReset()
  mockGetAddresses.mockReset().mockResolvedValue([])
})

describe('/account landing page', () => {
  it('greets the user by name and links to order history', async () => {
    mockGetCurrentUser.mockResolvedValue({
      isAuthenticated: true,
      userId: 'u1',
      email: 'ada@example.com',
      name: 'Ada',
      roles: []
    })

    const { default: AccountPage } = await import('@/app/(account)/account/page')
    render(await AccountPage())

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/ada/i)
    const ordersLink = screen.getByRole('link', { name: /order/i })
    expect(ordersLink).toHaveAttribute('href', '/account/orders')
  })

  it('falls back to the email when no name is set', async () => {
    mockGetCurrentUser.mockResolvedValue({
      isAuthenticated: true,
      userId: 'u1',
      email: 'ada@example.com',
      name: null,
      roles: []
    })

    const { default: AccountPage } = await import('@/app/(account)/account/page')
    render(await AccountPage())

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/ada@example\.com/i)
  })
})
