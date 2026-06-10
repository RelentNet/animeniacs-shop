import { OrderDetailView } from '@/components/orders/OrderDetailView'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

const baseOrder = {
  id: 'order-1',
  squareOrderId: 'sq-order-1',
  userId: 'owner-1',
  buyerEmail: 'buyer@example.com',
  status: 'completed' as const,
  totalCents: 2599,
  currency: 'USD',
  fulfillmentState: 'PREPARED',
  refundedCents: 0,
  placedAt: new Date('2026-06-10T12:00:00Z'),
  lineItems: [
    { name: 'Sticker Pack', quantity: 2, unitPriceCents: 1000, totalCents: 2000 },
    { name: 'Poster', quantity: 1, unitPriceCents: 599, totalCents: 599 }
  ]
}

describe('OrderDetailView', () => {
  it('renders the status label, fulfillment label, total, and line items', () => {
    render(<OrderDetailView order={baseOrder as any} />)
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Being prepared')).toBeInTheDocument()
    expect(screen.getByText(/\$25\.99/)).toBeInTheDocument()
    expect(screen.getByText('Sticker Pack')).toBeInTheDocument()
    expect(screen.getByText('Poster')).toBeInTheDocument()
  })

  it('shows a refunded line when refundedCents > 0', () => {
    const refunded = {
      ...baseOrder,
      status: 'partially_refunded' as const,
      refundedCents: 500
    }
    render(<OrderDetailView order={refunded as any} />)
    expect(screen.getByText('Partially refunded')).toBeInTheDocument()
    expect(screen.getByText(/Refunded/)).toBeInTheDocument()
    expect(screen.getByText(/\$5\.00/)).toBeInTheDocument()
  })

  it('does not show a refunded line when refundedCents is 0', () => {
    render(<OrderDetailView order={baseOrder as any} />)
    expect(screen.queryByText(/Refunded/)).not.toBeInTheDocument()
  })

  it('shows "Processing" when fulfillmentState is null', () => {
    const noFulfillment = { ...baseOrder, fulfillmentState: null }
    render(<OrderDetailView order={noFulfillment as any} />)
    expect(screen.getByText('Processing')).toBeInTheDocument()
  })
})
