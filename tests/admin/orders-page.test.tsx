import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockListOrders = vi.fn()
const mockCountOrders = vi.fn()

vi.mock('@/lib/db/queries/orders', () => ({
  listOrders: mockListOrders,
  countOrders: mockCountOrders
}))

function order(over: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    squareOrderId: 'sq-order-1',
    squarePaymentId: 'pay-1',
    userId: 'u1',
    buyerEmail: 'buyer@example.com',
    squareCustomerId: null,
    status: 'completed',
    totalCents: 2599,
    currency: 'USD',
    lineItems: [],
    fulfillmentState: 'PROPOSED',
    refundedCents: 0,
    placedAt: new Date('2026-06-10T12:00:00Z'),
    raw: null,
    createdAt: new Date('2026-06-10T12:00:00Z'),
    updatedAt: new Date('2026-06-10T12:00:00Z'),
    ...over
  }
}

beforeEach(() => {
  mockListOrders.mockReset().mockResolvedValue([])
  mockCountOrders.mockReset().mockResolvedValue(0)
})

describe('/admin/orders list page', () => {
  it('renders a row per order linking to the detail page, with total + labels', async () => {
    mockListOrders.mockResolvedValue([order()])
    mockCountOrders.mockResolvedValue(1)

    const { default: OrdersListPage } = await import('@/app/(admin)/admin/orders/page')
    render(await OrdersListPage({ searchParams: {} }))

    expect(screen.getByRole('heading', { level: 1, name: /orders/i })).toBeInTheDocument()
    expect(screen.getByText('buyer@example.com')).toBeInTheDocument()
    expect(screen.getByText('$25.99')).toBeInTheDocument()
    // Friendly status + fulfillment labels (reused from labels.ts).
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Processing')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /sq-order-1/i })
    expect(link).toHaveAttribute('href', '/admin/orders/11111111-1111-1111-1111-111111111111')
  })

  it('passes searchParams through to listOrders / countOrders as filters + pagination', async () => {
    const { default: OrdersListPage } = await import('@/app/(admin)/admin/orders/page')
    await OrdersListPage({
      searchParams: { status: 'refunded', fulfillment: 'COMPLETED', q: 'buyer', page: '2' }
    })

    expect(mockListOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'refunded',
        fulfillmentState: 'COMPLETED',
        q: 'buyer',
        offset: 25
      })
    )
    expect(mockCountOrders).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'refunded', fulfillmentState: 'COMPLETED', q: 'buyer' })
    )
  })

  it('ignores an invalid status filter rather than passing garbage to the query', async () => {
    const { default: OrdersListPage } = await import('@/app/(admin)/admin/orders/page')
    await OrdersListPage({ searchParams: { status: 'bogus' } })
    const arg = mockListOrders.mock.calls[0][0]
    expect(arg.status).toBeUndefined()
  })

  it('shows an empty state when there are no orders', async () => {
    mockListOrders.mockResolvedValue([])
    mockCountOrders.mockResolvedValue(0)
    const { default: OrdersListPage } = await import('@/app/(admin)/admin/orders/page')
    render(await OrdersListPage({ searchParams: {} }))
    expect(screen.getByText(/no orders/i)).toBeInTheDocument()
  })

  it('renders filter controls (status select, fulfillment select, search input)', async () => {
    const { default: OrdersListPage } = await import('@/app/(admin)/admin/orders/page')
    render(await OrdersListPage({ searchParams: {} }))
    const form = screen.getByRole('search')
    expect(within(form).getByLabelText(/status/i)).toBeInTheDocument()
    expect(within(form).getByLabelText(/fulfillment/i)).toBeInTheDocument()
    expect(within(form).getByLabelText(/search/i)).toBeInTheDocument()
  })
})

describe('/admin index nav', () => {
  it('lists an Orders section linking to /admin/orders', async () => {
    const { default: AdminIndexPage } = await import('@/app/(admin)/admin/page')
    render(await AdminIndexPage())
    const link = screen.getByRole('link', { name: /orders/i })
    expect(link).toHaveAttribute('href', '/admin/orders')
  })
})
