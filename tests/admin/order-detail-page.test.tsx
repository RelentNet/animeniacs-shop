import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// useFormState (react-dom) is undefined under the jsdom/SSR transform used by
// these unit tests; stub it to a stable [state, action] tuple so the client
// RefundPanel renders. The component contract is unchanged in production.
vi.mock('react-dom', async (orig) => {
  const actual = await orig<typeof import('react-dom')>()
  return { ...actual, useFormState: (_action: unknown, initial: unknown) => [initial, vi.fn()] }
})

const mockGetOrderById = vi.fn()
const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})

vi.mock('@/lib/db/queries/orders', () => ({
  getOrderById: mockGetOrderById
}))
vi.mock('next/navigation', () => ({ notFound: mockNotFound }))

function order(over: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    squareOrderId: 'sq-order-1',
    squarePaymentId: 'pay-1',
    userId: 'u1',
    buyerEmail: 'buyer@example.com',
    squareCustomerId: 'cust-1',
    status: 'completed',
    totalCents: 2599,
    currency: 'USD',
    lineItems: [{ name: 'Sticker pack', quantity: 2, unitPriceCents: 500, totalCents: 1000 }],
    fulfillmentState: 'PROPOSED',
    refundedCents: 0,
    placedAt: new Date('2026-06-10T12:00:00Z'),
    raw: { id: 'sq-order-1' },
    createdAt: new Date('2026-06-10T12:00:00Z'),
    updatedAt: new Date('2026-06-10T12:00:00Z'),
    ...over
  }
}

beforeEach(() => {
  mockGetOrderById.mockReset().mockResolvedValue(undefined)
  mockNotFound.mockClear()
})

describe('/admin/orders/[id] detail page', () => {
  it('renders order identity, buyer, payment, status, fulfillment, and line items', async () => {
    mockGetOrderById.mockResolvedValue(order())
    const { default: OrderDetailPage } = await import('@/app/(admin)/admin/orders/[id]/page')
    render(await OrderDetailPage({ params: { id: '11111111-1111-1111-1111-111111111111' } }))

    expect(screen.getByText('sq-order-1')).toBeInTheDocument()
    expect(screen.getByText('buyer@example.com')).toBeInTheDocument()
    expect(screen.getByText('pay-1')).toBeInTheDocument()
    expect(screen.getByText('cust-1')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Processing')).toBeInTheDocument()
    expect(screen.getByText('Sticker pack')).toBeInTheDocument()
    // Total $25.99 appears.
    expect(screen.getAllByText('$25.99').length).toBeGreaterThan(0)
  })

  it('shows the refunded line when the order has been refunded', async () => {
    mockGetOrderById.mockResolvedValue(order({ status: 'refunded', refundedCents: 2599 }))
    const { default: OrderDetailPage } = await import('@/app/(admin)/admin/orders/[id]/page')
    render(await OrderDetailPage({ params: { id: 'x' } }))
    // The "$25.99 of $25.99" refunded-amount line is present.
    expect(screen.getByText(/\$25\.99 of \$25\.99/)).toBeInTheDocument()
  })

  it('renders the refund + fulfillment panels for a refundable, non-terminal order', async () => {
    mockGetOrderById.mockResolvedValue(order())
    const { default: OrderDetailPage } = await import('@/app/(admin)/admin/orders/[id]/page')
    render(await OrderDetailPage({ params: { id: 'x' } }))

    expect(screen.getByRole('heading', { name: /refund/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /fulfillment/i })).toBeInTheDocument()
    // Refund form (reason + confirm) is available.
    expect(screen.getByRole('button', { name: /issue full refund/i })).toBeInTheDocument()
    // Fulfillment can advance from PROPOSED.
    expect(screen.getByRole('button', { name: /push to square/i })).toBeInTheDocument()
  })

  it('disables the refund panel when there is no Square payment id', async () => {
    mockGetOrderById.mockResolvedValue(order({ squarePaymentId: null }))
    const { default: OrderDetailPage } = await import('@/app/(admin)/admin/orders/[id]/page')
    render(await OrderDetailPage({ params: { id: 'x' } }))
    expect(screen.queryByRole('button', { name: /issue full refund/i })).not.toBeInTheDocument()
    expect(screen.getByText(/no square payment id/i)).toBeInTheDocument()
  })

  it('shows no fulfillment moves when the state is terminal (COMPLETED)', async () => {
    mockGetOrderById.mockResolvedValue(order({ fulfillmentState: 'COMPLETED' }))
    const { default: OrderDetailPage } = await import('@/app/(admin)/admin/orders/[id]/page')
    render(await OrderDetailPage({ params: { id: 'x' } }))
    expect(screen.queryByRole('button', { name: /push to square/i })).not.toBeInTheDocument()
    expect(screen.getByText(/no further fulfillment moves/i)).toBeInTheDocument()
  })

  it('calls notFound() when the order does not exist', async () => {
    mockGetOrderById.mockResolvedValue(undefined)
    const { default: OrderDetailPage } = await import('@/app/(admin)/admin/orders/[id]/page')
    await expect(OrderDetailPage({ params: { id: 'missing' } })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })
})
