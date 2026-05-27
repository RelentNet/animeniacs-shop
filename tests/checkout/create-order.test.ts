import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockOrdersCreate } = vi.hoisted(() => ({ mockOrdersCreate: vi.fn() }))
vi.mock('@/lib/square/client', () => ({
  getSquareClient: () => ({ orders: { create: mockOrdersCreate } })
}))

import { createSquareOrder } from '@/lib/checkout/create-order'

beforeEach(() => {
  mockOrdersCreate.mockReset()
})

const LINES = [
  { catalogItemId: 'A', variationId: 'V_A', quantity: 2, unitPriceCents: 2500, name: 'Item A' },
  { catalogItemId: 'B', variationId: 'V_B', quantity: 1, unitPriceCents: 3000, name: 'Item B' }
]

describe('createSquareOrder', () => {
  it('returns orderId on success', async () => {
    mockOrdersCreate.mockResolvedValue({ order: { id: 'ORDER_123' } })
    const result = await createSquareOrder({
      lines: LINES,
      cartId: 'cart-uuid',
      locationId: 'LOC_X'
    })
    expect(result.orderId).toBe('ORDER_123')
  })

  it('passes locationId and lineItems to Square', async () => {
    mockOrdersCreate.mockResolvedValue({ order: { id: 'ORDER_456' } })
    await createSquareOrder({ lines: LINES, cartId: 'cart-uuid', locationId: 'LOC_X' })
    const call = mockOrdersCreate.mock.calls[0][0]
    expect(call.order.locationId).toBe('LOC_X')
    expect(call.order.lineItems).toHaveLength(2)
    expect(call.order.lineItems[0].catalogObjectId).toBe('V_A')
    expect(call.order.lineItems[0].quantity).toBe('2')
  })

  it('sets cart_id in metadata and as reference_id', async () => {
    mockOrdersCreate.mockResolvedValue({ order: { id: 'ORDER_789' } })
    await createSquareOrder({ lines: LINES, cartId: 'cart-uuid-abc', locationId: 'LOC_X' })
    const call = mockOrdersCreate.mock.calls[0][0]
    expect(call.order.referenceId).toBe('cart-uuid-abc')
    expect(call.order.metadata).toEqual({ cart_id: 'cart-uuid-abc' })
  })

  it('uses idempotencyKey = cartId so retries do not double-create orders', async () => {
    mockOrdersCreate.mockResolvedValue({ order: { id: 'ORDER_X' } })
    await createSquareOrder({ lines: LINES, cartId: 'cart-uuid-idem', locationId: 'LOC_X' })
    expect(mockOrdersCreate.mock.calls[0][0].idempotencyKey).toBe('cart-uuid-idem')
  })

  it('throws if Square response lacks order.id', async () => {
    mockOrdersCreate.mockResolvedValue({ order: null })
    await expect(
      createSquareOrder({ lines: LINES, cartId: 'cart-uuid', locationId: 'LOC_X' })
    ).rejects.toThrow(/order id/i)
  })
})
