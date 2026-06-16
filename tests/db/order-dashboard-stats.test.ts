import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {
  select: vi.fn(),
  from: vi.fn()
}

vi.mock('@/lib/db/client', () => ({ db: mockDb }))

beforeEach(() => {
  mockDb.select.mockReset().mockReturnThis()
  mockDb.from.mockReset().mockResolvedValue([])
})

describe('getOrderDashboardStats', () => {
  it('maps the single aggregate row into the dashboard shape', async () => {
    mockDb.from.mockResolvedValue([
      {
        ordersToday: 2,
        revenueToday: 5000,
        orders7d: 9,
        revenue7d: 21000,
        orders30d: 30,
        revenue30d: 90000,
        refundedTotal: 1500,
        needsFulfillment: 4
      }
    ])

    const { getOrderDashboardStats } = await import('@/lib/db/queries/orders')
    const stats = await getOrderDashboardStats()

    expect(stats).toEqual({
      ordersToday: 2,
      revenueTodayCents: 5000,
      orders7d: 9,
      revenue7dCents: 21000,
      orders30d: 30,
      revenue30dCents: 90000,
      refundedTotalCents: 1500,
      needsFulfillment: 4
    })
    // Single round-trip: one aggregate select.
    expect(mockDb.select).toHaveBeenCalledTimes(1)
  })

  it('coerces nulls/empty result to zeroes (no orders yet)', async () => {
    mockDb.from.mockResolvedValue([])
    const { getOrderDashboardStats } = await import('@/lib/db/queries/orders')
    const stats = await getOrderDashboardStats()
    expect(stats).toEqual({
      ordersToday: 0,
      revenueTodayCents: 0,
      orders7d: 0,
      revenue7dCents: 0,
      orders30d: 0,
      revenue30dCents: 0,
      refundedTotalCents: 0,
      needsFulfillment: 0
    })
  })

  it('coerces null sums (postgres SUM of no rows) to 0', async () => {
    mockDb.from.mockResolvedValue([
      {
        ordersToday: 0,
        revenueToday: null,
        orders7d: 0,
        revenue7d: null,
        orders30d: 0,
        revenue30d: null,
        refundedTotal: null,
        needsFulfillment: 0
      }
    ])
    const { getOrderDashboardStats } = await import('@/lib/db/queries/orders')
    const stats = await getOrderDashboardStats()
    expect(stats.revenueTodayCents).toBe(0)
    expect(stats.refundedTotalCents).toBe(0)
  })
})
