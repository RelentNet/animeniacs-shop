import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockValidate, mockCreateLink, mockCreatePending } = vi.hoisted(() => ({
  mockValidate: vi.fn(),
  mockCreateLink: vi.fn(),
  mockCreatePending: vi.fn()
}))

vi.mock('@/lib/checkout/validate-cart', () => ({ validateCart: mockValidate }))
vi.mock('@/lib/checkout/create-payment-link', () => ({ createPaymentLink: mockCreateLink }))
vi.mock('@/lib/db/queries/abandoned-carts', () => ({ createPendingCart: mockCreatePending }))
// The route imports @logto/next/server-actions (whose transitive next/navigation
// import is unresolvable under vitest). Mock it as "no session" so buyerEmail
// resolves to null here — signed-in capture is covered by checkout-buyer-email.test.ts.
vi.mock('@logto/next/server-actions', () => ({
  getLogtoContext: vi.fn().mockRejectedValue(new Error('no session'))
}))

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  })
}

afterEach(() => {
  mockValidate.mockReset()
  mockCreateLink.mockReset()
  mockCreatePending.mockReset()
})

describe('POST /api/checkout', () => {
  it('happy path returns checkoutUrl + cartId', async () => {
    mockValidate.mockResolvedValue({
      ok: true,
      lines: [
        { catalogItemId: 'A', variationId: 'V', quantity: 1, unitPriceCents: 2500, name: 'A' }
      ]
    })
    mockCreateLink.mockResolvedValue({
      checkoutUrl: 'https://square/checkout',
      orderId: 'ORDER_X'
    })
    mockCreatePending.mockResolvedValue({})
    process.env.SQUARE_LOCATION_ID = 'LOC_X'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://dev.animeniacs.shop'

    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(
      makeRequest({
        items: [{ catalogItemId: 'A', variationId: 'V', quantity: 1, expectedUnitPriceCents: 2500 }]
      })
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.checkoutUrl).toBe('https://square/checkout')
    expect(typeof json.cartId).toBe('string')
    expect(mockCreateLink).toHaveBeenCalled()
    expect(mockCreatePending).toHaveBeenCalled()
  })

  it('returns 409 with mismatches when validateCart rejects', async () => {
    mockValidate.mockResolvedValue({
      ok: false,
      mismatches: [{ catalogItemId: 'A', variationId: 'V', expected: 2500, actual: 3000 }]
    })
    process.env.SQUARE_LOCATION_ID = 'LOC_X'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://dev.animeniacs.shop'
    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(
      makeRequest({
        items: [{ catalogItemId: 'A', variationId: 'V', quantity: 1, expectedUnitPriceCents: 2500 }]
      })
    )
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toBe('price_changed')
    expect(json.mismatches).toHaveLength(1)
    expect(mockCreateLink).not.toHaveBeenCalled()
  })

  it('returns 400 on malformed body', async () => {
    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest('not json'))
    expect(res.status).toBe(400)
  })

  it('returns 400 when items array is missing', async () => {
    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 on empty items array', async () => {
    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest({ items: [] }))
    expect(res.status).toBe(400)
  })

  it('returns 500 when createPaymentLink throws', async () => {
    mockValidate.mockResolvedValue({
      ok: true,
      lines: [
        { catalogItemId: 'A', variationId: 'V', quantity: 1, unitPriceCents: 2500, name: 'A' }
      ]
    })
    mockCreateLink.mockRejectedValue(new Error('square down'))
    process.env.SQUARE_LOCATION_ID = 'LOC_X'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://dev.animeniacs.shop'
    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(
      makeRequest({
        items: [{ catalogItemId: 'A', variationId: 'V', quantity: 1, expectedUnitPriceCents: 2500 }]
      })
    )
    expect(res.status).toBe(500)
  })

  it('returns 500 if SQUARE_LOCATION_ID is unset', async () => {
    process.env.SQUARE_LOCATION_ID = ''
    process.env.NEXT_PUBLIC_SITE_URL = 'https://dev.animeniacs.shop'
    mockValidate.mockResolvedValue({
      ok: true,
      lines: [
        { catalogItemId: 'A', variationId: 'V', quantity: 1, unitPriceCents: 2500, name: 'A' }
      ]
    })
    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(
      makeRequest({
        items: [{ catalogItemId: 'A', variationId: 'V', quantity: 1, expectedUnitPriceCents: 2500 }]
      })
    )
    expect(res.status).toBe(500)
  })

  it('persists abandoned_carts row with squareOrderId from payment link', async () => {
    mockValidate.mockResolvedValue({
      ok: true,
      lines: [
        { catalogItemId: 'A', variationId: 'V', quantity: 1, unitPriceCents: 2500, name: 'A' }
      ]
    })
    mockCreateLink.mockResolvedValue({ checkoutUrl: 'https://x', orderId: 'ORDER_Y' })
    mockCreatePending.mockResolvedValue({})
    process.env.SQUARE_LOCATION_ID = 'LOC_X'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://x'
    const { POST } = await import('@/app/api/checkout/route')
    const items = [
      { catalogItemId: 'A', variationId: 'V', quantity: 1, expectedUnitPriceCents: 2500 }
    ]
    await POST(makeRequest({ items }))
    expect(mockCreatePending).toHaveBeenCalledWith(
      expect.objectContaining({
        squareOrderId: 'ORDER_Y',
        buyerEmail: null,
        cartSnapshot: { items }
      })
    )
  })

  it('does not export a GET handler', async () => {
    const mod = await import('@/app/api/checkout/route')
    expect((mod as Record<string, unknown>).GET).toBeUndefined()
  })
})
