import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

  it('calls notFound() when the order does not exist', async () => {
    mockGetOrderById.mockResolvedValue(undefined)
    const { default: OrderDetailPage } = await import('@/app/(admin)/admin/orders/[id]/page')
    await expect(OrderDetailPage({ params: { id: 'missing' } })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })
})
