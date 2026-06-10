import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetCartsForReminder = vi.fn()
const mockMarkReminderSent = vi.fn().mockResolvedValue(undefined)
const mockSendAbandonedCartEmail = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/db/queries/abandoned-carts', () => ({
  getCartsForReminder: mockGetCartsForReminder,
  markReminderSent: mockMarkReminderSent
}))
vi.mock('@/lib/notifications/email', () => ({
  sendAbandonedCartEmail: mockSendAbandonedCartEmail
}))

const CRON_SECRET = 'test-secret-value'

describe('POST /api/cron/abandoned-carts', () => {
  beforeEach(() => {
    mockGetCartsForReminder.mockReset()
    mockMarkReminderSent.mockReset().mockResolvedValue(undefined)
    mockSendAbandonedCartEmail.mockReset().mockResolvedValue(undefined)
    vi.stubEnv('CRON_SECRET', CRON_SECRET)
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://dev.animeniacs.shop')
    vi.stubEnv('ABANDONED_CART_THRESHOLD_MINUTES', '60')
  })

  it('returns 401 without the correct secret', async () => {
    const { POST } = await import('@/app/api/cron/abandoned-carts/route')
    const req = new NextRequest('http://localhost/api/cron/abandoned-carts', {
      method: 'POST',
      headers: { 'x-cron-secret': 'wrong' }
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 401 with no secret header', async () => {
    const { POST } = await import('@/app/api/cron/abandoned-carts/route')
    const req = new NextRequest('http://localhost/api/cron/abandoned-carts', { method: 'POST' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('processes eligible carts and returns processed count', async () => {
    mockGetCartsForReminder.mockResolvedValue([
      { cartId: 'cart-1', buyerEmail: 'a@b.com', cartSnapshot: { items: [] } },
      { cartId: 'cart-2', buyerEmail: 'c@d.com', cartSnapshot: { items: [] } }
    ])
    const { POST } = await import('@/app/api/cron/abandoned-carts/route')
    const req = new NextRequest('http://localhost/api/cron/abandoned-carts', {
      method: 'POST',
      headers: { 'x-cron-secret': CRON_SECRET }
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.processed).toBe(2)
    expect(mockSendAbandonedCartEmail).toHaveBeenCalledTimes(2)
    expect(mockMarkReminderSent).toHaveBeenCalledTimes(2)
  })

  it('returns processed:0 when no eligible carts', async () => {
    mockGetCartsForReminder.mockResolvedValue([])
    const { POST } = await import('@/app/api/cron/abandoned-carts/route')
    const req = new NextRequest('http://localhost/api/cron/abandoned-carts', {
      method: 'POST',
      headers: { 'x-cron-secret': CRON_SECRET }
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.processed).toBe(0)
  })
})
