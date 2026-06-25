import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetCurrentUser = vi.fn()
const mockCreatePendingCart = vi.fn().mockResolvedValue({})
const mockCreatePaymentLink = vi.fn().mockResolvedValue({
  checkoutUrl: 'https://squareup.com/pay/abc',
  orderId: 'sq-order-1'
})
const mockValidateCart = vi.fn().mockResolvedValue({ ok: true, lines: [] })
const mockFindOrCreate = vi.fn()
const mockPriceShipping = vi
  .fn()
  .mockResolvedValue({ amountCents: 1000, selection: null, fallbackUsed: false })

vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock('@/lib/db/queries/abandoned-carts', () => ({ createPendingCart: mockCreatePendingCart }))
vi.mock('@/lib/checkout/create-payment-link', () => ({ createPaymentLink: mockCreatePaymentLink }))
vi.mock('@/lib/checkout/validate-cart', () => ({ validateCart: mockValidateCart }))
vi.mock('@/lib/square/customers', () => ({ findOrCreateSquareCustomer: mockFindOrCreate }))
vi.mock('@/lib/shipping/quote', () => ({ priceShipping: mockPriceShipping }))

const validBody = {
  items: [
    { catalogItemId: 'CAT_1', variationId: 'VAR_1', quantity: 1, expectedUnitPriceCents: 1000 }
  ],
  shippingAddress: {
    firstName: 'Ada',
    lastName: 'L',
    line1: '1 St',
    city: 'LA',
    state: 'CA',
    zip: '90012',
    country: 'US'
  }
}

function makeReq() {
  return new NextRequest('http://localhost/api/checkout', {
    method: 'POST',
    body: JSON.stringify(validBody)
  })
}

beforeEach(() => {
  mockGetCurrentUser.mockReset()
  mockCreatePendingCart.mockReset().mockResolvedValue({})
  mockCreatePaymentLink.mockReset().mockResolvedValue({
    checkoutUrl: 'https://squareup.com/pay/abc',
    orderId: 'sq-order-1'
  })
  mockValidateCart.mockReset().mockResolvedValue({ ok: true, lines: [] })
  mockFindOrCreate.mockReset()
  mockPriceShipping.mockReset().mockResolvedValue({ amountCents: 1000, selection: null, fallbackUsed: false })
  vi.stubEnv('SQUARE_LOCATION_ID', 'LOC_1')
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://dev.animeniacs.shop')
})

describe('POST /api/checkout — Square customer mapping', () => {
  it('signed-in buyer: maps to a Square customer + persists the identity bridge', async () => {
    mockGetCurrentUser.mockResolvedValue({
      isAuthenticated: true,
      userId: 'user-123',
      email: 'buyer@example.com',
      name: 'Ada',
      roles: []
    })
    mockFindOrCreate.mockResolvedValue('sq_cust_1')

    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeReq())
    expect(res.status).toBe(200)

    expect(mockFindOrCreate).toHaveBeenCalledWith({
      userId: 'user-123',
      email: 'buyer@example.com',
      name: 'Ada'
    })
    expect(mockCreatePaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'sq_cust_1' })
    )
    expect(mockCreatePendingCart).toHaveBeenCalledWith(
      expect.objectContaining({ buyerUserId: 'user-123', squareCustomerId: 'sq_cust_1' })
    )
  })

  it('still returns a checkout URL when the Customers API throws (best-effort)', async () => {
    mockGetCurrentUser.mockResolvedValue({
      isAuthenticated: true,
      userId: 'user-123',
      email: 'buyer@example.com',
      name: 'Ada',
      roles: []
    })
    mockFindOrCreate.mockRejectedValue(new Error('square customers down'))

    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeReq())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.checkoutUrl).toBe('https://squareup.com/pay/abc')
    // customerId omitted from the payment link
    expect(mockCreatePaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: undefined })
    )
    // bridge still records the buyer's sub; squareCustomerId null
    expect(mockCreatePendingCart).toHaveBeenCalledWith(
      expect.objectContaining({ buyerUserId: 'user-123', squareCustomerId: null })
    )
  })

  it('guest checkout: passes null bridge fields and never calls the Customers API', async () => {
    mockGetCurrentUser.mockResolvedValue({
      isAuthenticated: false,
      userId: null,
      email: null,
      name: null,
      roles: []
    })

    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeReq())
    expect(res.status).toBe(200)

    expect(mockFindOrCreate).not.toHaveBeenCalled()
    expect(mockCreatePendingCart).toHaveBeenCalledWith(
      expect.objectContaining({ buyerUserId: null, squareCustomerId: null })
    )
  })
})
