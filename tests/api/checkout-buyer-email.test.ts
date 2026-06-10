import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

const mockGetLogtoContext = vi.fn()
const mockCreatePendingCart = vi.fn().mockResolvedValue({})
const mockCreatePaymentLink = vi.fn().mockResolvedValue({
  checkoutUrl: 'https://squareup.com/pay/abc',
  orderId: 'sq-order-1'
})
const mockValidateCart = vi.fn().mockResolvedValue({ ok: true, lines: [] })

vi.mock('@logto/next/server-actions', () => ({ getLogtoContext: mockGetLogtoContext }))
vi.mock('@/lib/db/queries/abandoned-carts', () => ({ createPendingCart: mockCreatePendingCart }))
vi.mock('@/lib/checkout/create-payment-link', () => ({ createPaymentLink: mockCreatePaymentLink }))
vi.mock('@/lib/checkout/validate-cart', () => ({ validateCart: mockValidateCart }))
vi.mock('@/lib/logto', () => ({ logtoConfig: {} }))

const validBody = {
  items: [{ catalogItemId: 'CAT_1', variationId: 'VAR_1', quantity: 1, expectedUnitPriceCents: 1000 }]
}

describe('POST /api/checkout — buyer email capture', () => {
  it('writes buyer email when user is signed in', async () => {
    mockGetLogtoContext.mockResolvedValue({ claims: { email: 'buyer@example.com' } })
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
    mockGetLogtoContext.mockResolvedValue({ claims: null })
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
