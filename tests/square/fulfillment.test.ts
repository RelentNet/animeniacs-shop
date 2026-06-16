import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockOrdersGet = vi.fn()
const mockOrdersUpdate = vi.fn()
const mockGetSquareClient = vi.fn(() => ({
  orders: { get: mockOrdersGet, update: mockOrdersUpdate }
}))

vi.mock('@/lib/square/client', () => ({ getSquareClient: mockGetSquareClient }))

function squareOrder(over: Record<string, unknown> = {}) {
  return {
    order: {
      id: 'sq-1',
      version: 3,
      locationId: 'loc-1',
      fulfillments: [{ uid: 'ful-1', type: 'DIGITAL', state: 'PROPOSED' }],
      ...over
    }
  }
}

beforeEach(() => {
  mockOrdersGet.mockReset()
  mockOrdersUpdate.mockReset()
})

describe('advanceFulfillment — has fulfillment branch', () => {
  it('updates the existing fulfillment uid with the target state, passing version/locationId', async () => {
    mockOrdersGet.mockResolvedValue(squareOrder())
    mockOrdersUpdate.mockResolvedValue({ order: { version: 4 } })

    const { advanceFulfillment } = await import('@/lib/square/fulfillment')
    const result = await advanceFulfillment({ squareOrderId: 'sq-1', toState: 'PREPARED' })

    expect(result).toEqual({ fromState: 'PROPOSED', toState: 'PREPARED' })
    expect(mockOrdersGet).toHaveBeenCalledWith({ orderId: 'sq-1' })
    expect(mockOrdersUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'sq-1',
        idempotencyKey: 'fulfill_sq-1_PREPARED',
        order: {
          locationId: 'loc-1',
          version: 3,
          fulfillments: [{ uid: 'ful-1', state: 'PREPARED' }]
        }
      })
    )
  })

  it('allows the forward chain PROPOSED→RESERVED→PREPARED→COMPLETED', async () => {
    const { advanceFulfillment } = await import('@/lib/square/fulfillment')
    mockOrdersUpdate.mockResolvedValue({ order: {} })
    for (const [from, to] of [
      ['PROPOSED', 'RESERVED'],
      ['RESERVED', 'PREPARED'],
      ['PREPARED', 'COMPLETED']
    ] as const) {
      mockOrdersGet.mockResolvedValue(
        squareOrder({ fulfillments: [{ uid: 'ful-1', state: from }] })
      )
      await expect(advanceFulfillment({ squareOrderId: 'sq-1', toState: to })).resolves.toBeTruthy()
    }
  })

  it('allows CANCELED from a non-terminal state', async () => {
    mockOrdersGet.mockResolvedValue(
      squareOrder({ fulfillments: [{ uid: 'ful-1', state: 'RESERVED' }] })
    )
    mockOrdersUpdate.mockResolvedValue({ order: {} })
    const { advanceFulfillment } = await import('@/lib/square/fulfillment')
    await expect(
      advanceFulfillment({ squareOrderId: 'sq-1', toState: 'CANCELED' })
    ).resolves.toBeTruthy()
  })

  it('rejects a backward transition (PREPARED→RESERVED), without calling update', async () => {
    mockOrdersGet.mockResolvedValue(
      squareOrder({ fulfillments: [{ uid: 'ful-1', state: 'PREPARED' }] })
    )
    const { advanceFulfillment } = await import('@/lib/square/fulfillment')
    await expect(
      advanceFulfillment({ squareOrderId: 'sq-1', toState: 'RESERVED' })
    ).rejects.toThrow(/transition/i)
    expect(mockOrdersUpdate).not.toHaveBeenCalled()
  })

  it('rejects advancing a terminal fulfillment (COMPLETED), without calling update', async () => {
    mockOrdersGet.mockResolvedValue(
      squareOrder({ fulfillments: [{ uid: 'ful-1', state: 'COMPLETED' }] })
    )
    const { advanceFulfillment } = await import('@/lib/square/fulfillment')
    await expect(
      advanceFulfillment({ squareOrderId: 'sq-1', toState: 'CANCELED' })
    ).rejects.toThrow(/terminal|transition/i)
    expect(mockOrdersUpdate).not.toHaveBeenCalled()
  })

  it('rejects an invalid target state', async () => {
    mockOrdersGet.mockResolvedValue(squareOrder())
    const { advanceFulfillment } = await import('@/lib/square/fulfillment')
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: deliberately bad input
      advanceFulfillment({ squareOrderId: 'sq-1', toState: 'BOGUS' as any })
    ).rejects.toThrow()
    expect(mockOrdersUpdate).not.toHaveBeenCalled()
  })

  it('propagates a Square update error', async () => {
    mockOrdersGet.mockResolvedValue(squareOrder())
    mockOrdersUpdate.mockRejectedValue(new Error('VERSION_MISMATCH'))
    const { advanceFulfillment } = await import('@/lib/square/fulfillment')
    await expect(
      advanceFulfillment({ squareOrderId: 'sq-1', toState: 'RESERVED' })
    ).rejects.toThrow(/VERSION_MISMATCH/)
  })
})

describe('advanceFulfillment — no fulfillment branch', () => {
  it('throws a typed NO_FULFILLMENT error when the order has no fulfillment', async () => {
    mockOrdersGet.mockResolvedValue(squareOrder({ fulfillments: [] }))
    const { advanceFulfillment, NoFulfillmentError } = await import('@/lib/square/fulfillment')
    await expect(
      advanceFulfillment({ squareOrderId: 'sq-1', toState: 'PREPARED' })
    ).rejects.toBeInstanceOf(NoFulfillmentError)
    expect(mockOrdersUpdate).not.toHaveBeenCalled()
  })

  it('throws NO_FULFILLMENT when fulfillments is undefined', async () => {
    mockOrdersGet.mockResolvedValue(squareOrder({ fulfillments: undefined }))
    const { advanceFulfillment, NoFulfillmentError } = await import('@/lib/square/fulfillment')
    await expect(
      advanceFulfillment({ squareOrderId: 'sq-1', toState: 'PREPARED' })
    ).rejects.toBeInstanceOf(NoFulfillmentError)
  })
})
