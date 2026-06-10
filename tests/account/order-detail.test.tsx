import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetCurrentUser = vi.fn()
const mockGetOrderById = vi.fn()
const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})

vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock('@/lib/db/queries/orders', () => ({ getOrderById: mockGetOrderById }))
vi.mock('next/navigation', () => ({ notFound: mockNotFound }))

beforeEach(() => {
  mockGetCurrentUser.mockReset().mockResolvedValue({
    isAuthenticated: true,
    userId: 'owner-1',
    email: 'ada@example.com',
    name: 'Ada',
    roles: []
  })
  mockGetOrderById.mockReset()
  mockNotFound.mockClear()
})

const ownedOrder = {
  id: 'order-1',
  userId: 'owner-1',
  totalCents: 2599,
  currency: 'USD',
  status: 'completed',
  placedAt: new Date('2026-06-10T12:00:00Z'),
  lineItems: [{ name: 'Sticker Pack', quantity: 2, unitPriceCents: 1000, totalCents: 2000 }]
}

async function renderDetail(id: string) {
  const { default: OrderDetailPage } = await import('@/app/(account)/account/orders/[id]/page')
  return render(await OrderDetailPage({ params: { id } }))
}

describe('/account/orders/[id] detail page', () => {
  it('renders line items + total for the owner', async () => {
    mockGetOrderById.mockResolvedValue(ownedOrder)
    await renderDetail('order-1')
    expect(screen.getByText(/Sticker Pack/)).toBeInTheDocument()
    expect(screen.getByText(/\$25\.99/)).toBeInTheDocument()
    expect(mockNotFound).not.toHaveBeenCalled()
  })

  it('SECURITY: 404s when the order belongs to another user (IDOR guard)', async () => {
    mockGetOrderById.mockResolvedValue({ ...ownedOrder, userId: 'someone-else' })
    await expect(renderDetail('order-1')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('404s when the order does not exist', async () => {
    mockGetOrderById.mockResolvedValue(undefined)
    await expect(renderDetail('missing')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })
})
