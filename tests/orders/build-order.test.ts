import { buildOrder } from '@/lib/orders/build-order'
import { describe, expect, it } from 'vitest'

const squareOrder = {
  id: 'sq-order-1',
  locationId: 'LOC_1',
  state: 'COMPLETED',
  customerId: 'sq_cust_1',
  createdAt: '2026-06-10T12:00:00Z',
  closedAt: '2026-06-10T12:05:00Z',
  totalMoney: { amount: BigInt(2599), currency: 'USD' },
  lineItems: [
    {
      uid: 'li1',
      name: 'Sticker Pack',
      quantity: '2',
      catalogObjectId: 'VAR_1',
      variationName: 'Standard',
      basePriceMoney: { amount: BigInt(1000), currency: 'USD' },
      totalMoney: { amount: BigInt(2000), currency: 'USD' }
    },
    {
      uid: 'li2',
      name: 'Poster',
      quantity: '1',
      catalogObjectId: 'VAR_2',
      basePriceMoney: { amount: BigInt(599), currency: 'USD' },
      totalMoney: { amount: BigInt(599), currency: 'USD' }
    }
  ]
}

const bridge = {
  userId: 'user-123',
  buyerEmail: 'buyer@example.com',
  squareCustomerId: 'sq_cust_1',
  squarePaymentId: 'pay-1'
}

describe('buildOrder', () => {
  it('maps a Square order + bridge into a NewOrder', () => {
    const order = buildOrder(squareOrder, bridge)

    expect(order.squareOrderId).toBe('sq-order-1')
    expect(order.squarePaymentId).toBe('pay-1')
    expect(order.userId).toBe('user-123')
    expect(order.buyerEmail).toBe('buyer@example.com')
    expect(order.squareCustomerId).toBe('sq_cust_1')
    expect(order.status).toBe('completed')
    expect(order.totalCents).toBe(2599)
    expect(order.currency).toBe('USD')
    expect(order.raw).toBe(squareOrder)
  })

  it('converts bigint totalMoney.amount to a number', () => {
    const order = buildOrder(squareOrder, bridge)
    expect(typeof order.totalCents).toBe('number')
    expect(order.totalCents).toBe(2599)
  })

  it('maps line items with names, quantities, and per-line cents', () => {
    const order = buildOrder(squareOrder, bridge)
    const items = order.lineItems as Array<Record<string, unknown>>
    expect(items).toHaveLength(2)
    expect(items[0]).toEqual({
      name: 'Sticker Pack',
      quantity: 2,
      unitPriceCents: 1000,
      totalCents: 2000,
      catalogObjectId: 'VAR_1',
      variationName: 'Standard'
    })
    expect(items[1]).toMatchObject({
      name: 'Poster',
      quantity: 1,
      unitPriceCents: 599,
      totalCents: 599,
      catalogObjectId: 'VAR_2'
    })
  })

  it('sets placedAt from the Square order closedAt (falling back to createdAt)', () => {
    const order = buildOrder(squareOrder, bridge)
    expect(order.placedAt).toBeInstanceOf(Date)
    expect((order.placedAt as Date).toISOString()).toBe('2026-06-10T12:05:00.000Z')

    const noClose = { ...squareOrder, closedAt: undefined }
    const order2 = buildOrder(noClose, bridge)
    expect((order2.placedAt as Date).toISOString()).toBe('2026-06-10T12:00:00.000Z')
  })

  it('handles a guest order (null userId) and missing line items', () => {
    const order = buildOrder(
      { id: 'sq-2', totalMoney: { amount: BigInt(500), currency: 'USD' } },
      { userId: null, buyerEmail: null, squareCustomerId: null, squarePaymentId: null }
    )
    expect(order.userId).toBeNull()
    expect(order.buyerEmail).toBeNull()
    expect(order.lineItems).toEqual([])
    expect(order.totalCents).toBe(500)
  })
})
