import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetCurrentUser = vi.fn()
const mockGetOrdersForUser = vi.fn()

vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock('@/lib/db/queries/orders', () => ({ getOrdersForUser: mockGetOrdersForUser }))

beforeEach(() => {
  mockGetCurrentUser.mockReset().mockResolvedValue({
    isAuthenticated: true,
    userId: 'u1',
    email: 'ada@example.com',
    name: 'Ada',
    roles: []
  })
  mockGetOrdersForUser.mockReset()
})

describe('/account/orders list page', () => {
  it('renders each order with total + date and links to the detail page', async () => {
    mockGetOrdersForUser.mockResolvedValue([
      {
        id: 'order-1',
        totalCents: 2599,
        currency: 'USD',
        status: 'completed',
        placedAt: new Date('2026-06-10T12:00:00Z'),
        lineItems: []
      }
    ])

    const { default: OrdersPage } = await import('@/app/(account)/account/orders/page')
    render(await OrdersPage())

    expect(screen.getByText(/\$25\.99/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /view|detail|order/i })
    expect(link).toHaveAttribute('href', '/account/orders/order-1')
  })

  it('shows an empty state when there are no orders', async () => {
    mockGetOrdersForUser.mockResolvedValue([])

    const { default: OrdersPage } = await import('@/app/(account)/account/orders/page')
    render(await OrdersPage())

    expect(screen.getByText(/no orders/i)).toBeInTheDocument()
  })
})
