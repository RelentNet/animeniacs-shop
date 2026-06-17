import { render, screen, within } from '@testing-library/react'
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

describe('/admin/orders/[id] detail page (read-only log)', () => {
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
    expect(screen.getAllByText('$25.99').length).toBeGreaterThan(0)
  })

  it('shows the refunded line when the order has been refunded (reflected from Square)', async () => {
    mockGetOrderById.mockResolvedValue(order({ status: 'refunded', refundedCents: 2599 }))
    const { default: OrderDetailPage } = await import('@/app/(admin)/admin/orders/[id]/page')
    render(await OrderDetailPage({ params: { id: 'x' } }))
    expect(screen.getByText(/\$25\.99 of \$25\.99/)).toBeInTheDocument()
  })

  it('does NOT render any mutating controls (read-only: refunds + fulfillment live in Square)', async () => {
    mockGetOrderById.mockResolvedValue(order())
    const { default: OrderDetailPage } = await import('@/app/(admin)/admin/orders/[id]/page')
    render(await OrderDetailPage({ params: { id: 'x' } }))
    expect(screen.queryByRole('button', { name: /refund/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /push to square/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it("shows Square's literal order state from raw.state alongside our status", async () => {
    mockGetOrderById.mockResolvedValue(order({ raw: { id: 'sq-order-1', state: 'OPEN' } }))
    const { default: OrderDetailPage } = await import('@/app/(admin)/admin/orders/[id]/page')
    render(await OrderDetailPage({ params: { id: 'x' } }))
    // Our derived status (friendly) AND Square's raw state (literal) both shown.
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('OPEN')).toBeInTheDocument()
  })

  it('shows an em dash for Square state when raw has no state', async () => {
    mockGetOrderById.mockResolvedValue(order({ raw: { id: 'sq-order-1' } }))
    const { default: OrderDetailPage } = await import('@/app/(admin)/admin/orders/[id]/page')
    render(await OrderDetailPage({ params: { id: 'x' } }))
    const squareRow = screen.getByText('Square state').closest('div') as HTMLElement
    expect(within(squareRow).getByText('—')).toBeInTheDocument()
  })

  it('renders the Shipment section (recipient, address, carrier, tracking link) when present', async () => {
    mockGetOrderById.mockResolvedValue(
      order({
        raw: {
          id: 'sq-order-1',
          state: 'COMPLETED',
          fulfillments: [
            {
              type: 'SHIPMENT',
              shipmentDetails: {
                recipient: {
                  displayName: 'Ada Lovelace',
                  address: {
                    addressLine1: '123 Main St',
                    locality: 'Springfield',
                    administrativeDistrictLevel1: 'IL',
                    postalCode: '62704',
                    country: 'US'
                  }
                },
                carrier: 'USPS',
                trackingNumber: 'TRACK123',
                trackingUrl: 'https://track.example/TRACK123'
              }
            }
          ]
        }
      })
    )
    const { default: OrderDetailPage } = await import('@/app/(admin)/admin/orders/[id]/page')
    render(await OrderDetailPage({ params: { id: 'x' } }))
    expect(screen.getByRole('heading', { name: /shipment/i })).toBeInTheDocument()
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('123 Main St')).toBeInTheDocument()
    expect(screen.getByText('Springfield, IL 62704')).toBeInTheDocument()
    expect(screen.getByText('USPS')).toBeInTheDocument()
    const trackLink = screen.getByRole('link', { name: /TRACK123/i })
    expect(trackLink).toHaveAttribute('href', 'https://track.example/TRACK123')
  })

  it('shows a "No shipment details" empty state for orders without a SHIPMENT fulfillment', async () => {
    mockGetOrderById.mockResolvedValue(
      order({ raw: { id: 'sq-order-1', state: 'COMPLETED', fulfillments: [] } })
    )
    const { default: OrderDetailPage } = await import('@/app/(admin)/admin/orders/[id]/page')
    render(await OrderDetailPage({ params: { id: 'x' } }))
    expect(screen.getByRole('heading', { name: /shipment/i })).toBeInTheDocument()
    expect(screen.getByText(/no shipment details/i)).toBeInTheDocument()
  })

  it('calls notFound() when the order does not exist', async () => {
    mockGetOrderById.mockResolvedValue(undefined)
    const { default: OrderDetailPage } = await import('@/app/(admin)/admin/orders/[id]/page')
    await expect(OrderDetailPage({ params: { id: 'missing' } })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })
})
