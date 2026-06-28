import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockValidate, mockCreateLink, mockCreatePending, mockPriceShipping } = vi.hoisted(() => ({
  mockValidate: vi.fn(),
  mockCreateLink: vi.fn(),
  mockCreatePending: vi.fn(),
  mockPriceShipping: vi.fn()
}))

vi.mock('@/lib/checkout/validate-cart', () => ({ validateCart: mockValidate }))
vi.mock('@/lib/checkout/create-payment-link', () => ({ createPaymentLink: mockCreateLink }))
vi.mock('@/lib/db/queries/abandoned-carts', () => ({ createPendingCart: mockCreatePending }))
vi.mock('@/lib/shipping/quote', () => ({ priceShipping: mockPriceShipping }))
// Anonymous session here so buyerEmail resolves to null — signed-in capture is
// covered by checkout-buyer-email.test.ts.
vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: vi
    .fn()
    .mockResolvedValue({ isAuthenticated: false, userId: null, email: null, name: null, roles: [] })
}))

const ADDRESS = {
  firstName: 'Buyer',
  lastName: 'One',
  line1: '500 W Temple St',
  city: 'Los Angeles',
  state: 'CA',
  zip: '90012',
  country: 'US'
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  })
}

/** A well-formed request body (items + a shippable address). */
function validBody(extra: Record<string, unknown> = {}) {
  return {
    items: [{ catalogItemId: 'A', variationId: 'V', quantity: 1, expectedUnitPriceCents: 2500 }],
    shippingAddress: ADDRESS,
    ...extra
  }
}

beforeEach(() => {
  mockPriceShipping.mockResolvedValue({ amountCents: 1835, selection: null, fallbackUsed: false })
})

afterEach(() => {
  mockValidate.mockReset()
  mockCreateLink.mockReset()
  mockCreatePending.mockReset()
  mockPriceShipping.mockReset()
})

describe('POST /api/checkout', () => {
  it('happy path returns checkoutUrl + cartId and charges priced shipping', async () => {
    mockValidate.mockResolvedValue({
      ok: true,
      lines: [
        { catalogItemId: 'A', variationId: 'V', quantity: 1, unitPriceCents: 2500, name: 'A' }
      ]
    })
    mockCreateLink.mockResolvedValue({ checkoutUrl: 'https://square/checkout', orderId: 'ORDER_X' })
    mockCreatePending.mockResolvedValue({})
    process.env.SQUARE_LOCATION_ID = 'LOC_X'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://dev.animeniacs.shop'

    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest(validBody({ selectedRateId: 'rate_123' })))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.checkoutUrl).toBe('https://square/checkout')
    expect(typeof json.cartId).toBe('string')
    expect(mockPriceShipping).toHaveBeenCalledWith(expect.anything(), 'rate_123')
    expect(mockCreateLink).toHaveBeenCalledWith(
      expect.objectContaining({ shippingCents: 1835, shippingAddress: expect.objectContaining({ country: 'US' }) })
    )
  })

  it('rejects an un-shippable country with 422 before any payment link', async () => {
    process.env.SQUARE_LOCATION_ID = 'LOC_X'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://dev.animeniacs.shop'
    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(
      makeRequest(validBody({ shippingAddress: { ...ADDRESS, country: 'JP', state: '' } }))
    )
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toBe('country_not_shippable')
    expect(mockCreateLink).not.toHaveBeenCalled()
  })

  it('returns 409 with mismatches when validateCart rejects', async () => {
    mockValidate.mockResolvedValue({
      ok: false,
      mismatches: [{ catalogItemId: 'A', variationId: 'V', expected: 2500, actual: 3000 }]
    })
    process.env.SQUARE_LOCATION_ID = 'LOC_X'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://dev.animeniacs.shop'
    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest(validBody()))
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
    const res = await POST(makeRequest({ shippingAddress: ADDRESS }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when shippingAddress is missing', async () => {
    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(
      makeRequest({
        items: [{ catalogItemId: 'A', variationId: 'V', quantity: 1, expectedUnitPriceCents: 2500 }]
      })
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 on empty items array', async () => {
    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest(validBody({ items: [] })))
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
    const res = await POST(makeRequest(validBody()))
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
    const res = await POST(makeRequest(validBody()))
    expect(res.status).toBe(500)
  })

  it('persists abandoned_carts row with squareOrderId + captured shipping', async () => {
    mockValidate.mockResolvedValue({
      ok: true,
      lines: [
        { catalogItemId: 'A', variationId: 'V', quantity: 1, unitPriceCents: 2500, name: 'A' }
      ]
    })
    mockCreateLink.mockResolvedValue({ checkoutUrl: 'https://x', orderId: 'ORDER_Y' })
    mockCreatePending.mockResolvedValue({})
    mockPriceShipping.mockResolvedValue({
      amountCents: 1200,
      selection: { rateId: 'r1', shipmentId: 's1', carrier: 'USPS', service: 'Ground', amountCents: 1200 },
      fallbackUsed: false
    })
    process.env.SQUARE_LOCATION_ID = 'LOC_X'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://x'
    const { POST } = await import('@/app/api/checkout/route')
    const items = [
      { catalogItemId: 'A', variationId: 'V', quantity: 1, expectedUnitPriceCents: 2500 }
    ]
    await POST(makeRequest(validBody({ items, selectedRateId: 'r1' })))
    expect(mockCreatePending).toHaveBeenCalledWith(
      expect.objectContaining({
        squareOrderId: 'ORDER_Y',
        buyerEmail: null,
        cartSnapshot: expect.objectContaining({
          items,
          shipping: expect.objectContaining({
            selection: expect.objectContaining({ rateId: 'r1' }),
            fallbackUsed: false
          })
        })
      })
    )
  })

  it('does not export a GET handler', async () => {
    const mod = await import('@/app/api/checkout/route')
    expect((mod as Record<string, unknown>).GET).toBeUndefined()
  })
})
