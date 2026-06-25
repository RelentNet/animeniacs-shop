import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

const mockGetCurrentUser = vi.fn()
const mockCreatePendingCart = vi.fn().mockResolvedValue({})
const mockCreatePaymentLink = vi.fn().mockResolvedValue({
  checkoutUrl: 'https://squareup.com/pay/abc',
  orderId: 'sq-order-1'
})
const mockValidateCart = vi.fn().mockResolvedValue({ ok: true, lines: [] })

vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock('@/lib/db/queries/abandoned-carts', () => ({ createPendingCart: mockCreatePendingCart }))
vi.mock('@/lib/checkout/create-payment-link', () => ({ createPaymentLink: mockCreatePaymentLink }))
vi.mock('@/lib/checkout/validate-cart', () => ({ validateCart: mockValidateCart }))
vi.mock('@/lib/square/customers', () => ({
  findOrCreateSquareCustomer: vi.fn().mockResolvedValue('sq_1')
}))
vi.mock('@/lib/shipping/quote', () => ({
  priceShipping: vi.fn().mockResolvedValue({ amountCents: 1000, selection: null, fallbackUsed: false })
}))

const validBody = {
  items: [
    { catalogItemId: 'CAT_1', variationId: 'VAR_1', quantity: 1, expectedUnitPriceCents: 1000 }
  ],
  // No email here so the guest case still resolves buyerEmail to null.
  shippingAddress: {
    firstName: 'Guest',
    lastName: 'User',
    line1: '1 St',
    city: 'LA',
    state: 'CA',
    zip: '90012',
    country: 'US'
  }
}

describe('POST /api/checkout — buyer email capture', () => {
  it('writes buyer email when user is signed in', async () => {
    mockGetCurrentUser.mockResolvedValue({
      isAuthenticated: true,
      userId: 'user-1',
      email: 'buyer@example.com',
      name: null,
      roles: []
    })
    vi.stubEnv('SQUARE_LOCATION_ID', 'LOC_1')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://dev.animeniacs.shop')

    const { POST } = await import('@/app/api/checkout/route')
    const req = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      body: JSON.stringify(validBody)
    })
    await POST(req)

    expect(mockCreatePendingCart).toHaveBeenCalledWith(
      expect.objectContaining({ buyerEmail: 'buyer@example.com' })
    )
  })

  it('writes null email when user is not signed in', async () => {
    mockGetCurrentUser.mockResolvedValue({
      isAuthenticated: false,
      userId: null,
      email: null,
      name: null,
      roles: []
    })
    vi.stubEnv('SQUARE_LOCATION_ID', 'LOC_1')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://dev.animeniacs.shop')

    const { POST } = await import('@/app/api/checkout/route')
    const req = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      body: JSON.stringify(validBody)
    })
    await POST(req)

    expect(mockCreatePendingCart).toHaveBeenCalledWith(
      expect.objectContaining({ buyerEmail: null })
    )
  })
})
