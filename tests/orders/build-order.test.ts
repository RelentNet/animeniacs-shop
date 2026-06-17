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
    // raw is a JSON-safe snapshot of the Square order (NOT the live object — it
    // must be storable in the jsonb column; see the BigInt regression below).
    expect((order.raw as { id: string }).id).toBe('sq-order-1')
  })

  it('stores a JSON-serializable raw snapshot (no BigInt leaks into jsonb)', () => {
    // Regression: Square Money amounts are bigint; storing the live object in the
    // jsonb `raw` column threw "Do not know how to serialize a BigInt", which
    // killed ALL order recording on the webhook path. raw must be serializable.
    const order = buildOrder(squareOrder, bridge)
    expect(() => JSON.stringify(order.raw)).not.toThrow()
    const raw = order.raw as {
      totalMoney: { amount: unknown }
      lineItems: Array<{ basePriceMoney: { amount: unknown } }>
    }
    expect(typeof raw.totalMoney.amount).toBe('number')
    expect(raw.totalMoney.amount).toBe(2599)
    expect(typeof raw.lineItems[0].basePriceMoney.amount).toBe('number')
    expect(raw.lineItems[0].basePriceMoney.amount).toBe(1000)
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

  it('captures fulfillmentState from the first fulfillment', () => {
    const order = buildOrder(
      { ...squareOrder, fulfillments: [{ uid: 'f1', state: 'PREPARED' }] },
      bridge
    )
    expect(order.fulfillmentState).toBe('PREPARED')
  })

  it('picks the most-advanced state when multiple fulfillments exist', () => {
    const order = buildOrder(
      {
        ...squareOrder,
        fulfillments: [
          { uid: 'f1', state: 'PROPOSED' },
          { uid: 'f2', state: 'COMPLETED' },
          { uid: 'f3', state: 'RESERVED' }
        ]
      },
      bridge
    )
    expect(order.fulfillmentState).toBe('COMPLETED')
  })

  it('sets fulfillmentState to null when fulfillments are absent or empty', () => {
    expect(buildOrder(squareOrder, bridge).fulfillmentState).toBeNull()
    expect(buildOrder({ ...squareOrder, fulfillments: [] }, bridge).fulfillmentState).toBeNull()
  })

  it('does not set refundedCents at creation (left to the DB default)', () => {
    const order = buildOrder(squareOrder, bridge)
    expect(order.refundedCents).toBeUndefined()
  })
})
