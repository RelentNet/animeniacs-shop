import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

const { mockGetSquare, mockMarkCompleted } = vi.hoisted(() => ({
  mockGetSquare: vi.fn(),
  mockMarkCompleted: vi.fn()
}))

vi.mock('@/lib/square/client', () => ({
  getSquareClient: () => ({ orders: { get: mockGetSquare } })
}))

vi.mock('@/lib/db/queries/abandoned-carts', () => ({
  markCartCompleted: mockMarkCompleted
}))

// next/script renders inert in jsdom; we don't assert on its behavior, so stub it.
vi.mock('next/script', () => ({
  default: () => null
}))

// CartClearer needs a <CartProvider> (it calls useCart); it's covered by its
// own unit test. These tests assert on the success-page markup, not cart
// clearing, so stub it to render nothing.
vi.mock('@/components/cart/CartClearer', () => ({
  CartClearer: () => null
}))

import CheckoutSuccessPage from '@/app/checkout/success/page'

beforeEach(() => {
  mockGetSquare.mockReset()
  mockMarkCompleted.mockReset().mockResolvedValue(undefined)
})

describe('CheckoutSuccessPage', () => {
  it('renders generic thanks when orderId is missing', async () => {
    const ui = await CheckoutSuccessPage({ searchParams: {} })
    render(ui)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/thanks/i)
    expect(mockGetSquare).not.toHaveBeenCalled()
  })

  it('renders order details when Square returns the order', async () => {
    mockGetSquare.mockResolvedValue({
      order: {
        id: 'ORDER_X',
        totalMoney: { amount: 4500n, currency: 'USD' },
        lineItems: [{ name: 'Cool Print', quantity: '2', basePriceMoney: { amount: 2000n } }]
      }
    })
    const ui = await CheckoutSuccessPage({ searchParams: { orderId: 'ORDER_X' } })
    render(ui)
    expect(screen.getByText(/ORDER_X/)).toBeInTheDocument()
    // Line items render as "Cool Print × 2"; match via regex.
    expect(screen.getByText(/Cool Print/)).toBeInTheDocument()
    expect(screen.getByText(/\$45\.00/)).toBeInTheDocument()
  })

  it('renders generic thanks when Square returns no order', async () => {
    mockGetSquare.mockResolvedValue({ order: null })
    const ui = await CheckoutSuccessPage({ searchParams: { orderId: 'NOPE' } })
    render(ui)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/thanks/i)
    // Generic thanks does not contain the order id.
    expect(screen.queryByText(/NOPE/)).toBeNull()
  })

  it('renders generic thanks when Square throws', async () => {
    mockGetSquare.mockRejectedValue(new Error('boom'))
    const ui = await CheckoutSuccessPage({ searchParams: { orderId: 'X' } })
    render(ui)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/thanks/i)
  })

  it('marks the abandoned cart completed when order found', async () => {
    mockGetSquare.mockResolvedValue({
      order: {
        id: 'ORDER_Y',
        totalMoney: { amount: 1000n, currency: 'USD' },
        lineItems: []
      }
    })
    await CheckoutSuccessPage({ searchParams: { orderId: 'ORDER_Y' } })
    expect(mockMarkCompleted).toHaveBeenCalledWith('ORDER_Y')
  })
})
