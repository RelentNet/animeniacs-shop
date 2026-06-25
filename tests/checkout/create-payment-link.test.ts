import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))
vi.mock('@/lib/square/client', () => ({
  getSquareClient: () => ({ checkout: { paymentLinks: { create: mockCreate } } })
}))

import { createPaymentLink } from '@/lib/checkout/create-payment-link'

beforeEach(() => {
  mockCreate.mockReset()
})

const LINES = [
  { catalogItemId: 'A', variationId: 'V_A', quantity: 2, unitPriceCents: 2500, name: 'Item A' },
  { catalogItemId: 'B', variationId: 'V_B', quantity: 1, unitPriceCents: 3000, name: 'Item B' }
]

const OK_RESPONSE = {
  paymentLink: { url: 'https://sandbox.squareup.com/checkout/abc', orderId: 'ORDER_X' }
}

describe('createPaymentLink', () => {
  it('returns checkoutUrl and orderId on success', async () => {
    mockCreate.mockResolvedValue(OK_RESPONSE)
    const result = await createPaymentLink({
      lines: LINES,
      cartId: 'cart-uuid',
      locationId: 'LOC_X',
      redirectUrl: 'https://dev.animeniacs.shop/checkout/success'
    })
    expect(result).toEqual({
      checkoutUrl: 'https://sandbox.squareup.com/checkout/abc',
      orderId: 'ORDER_X'
    })
  })

  it('uses idempotencyKey = cartId so retries do not double-create', async () => {
    mockCreate.mockResolvedValue(OK_RESPONSE)
    await createPaymentLink({
      lines: LINES,
      cartId: 'cart-uuid-idem',
      locationId: 'LOC_X',
      redirectUrl: 'https://example.com/done'
    })
    expect(mockCreate.mock.calls[0][0].idempotencyKey).toBe('cart-uuid-idem')
  })

  it('embeds order inline with locationId, referenceId, lineItems, and metadata.cart_id', async () => {
    mockCreate.mockResolvedValue(OK_RESPONSE)
    await createPaymentLink({
      lines: LINES,
      cartId: 'cart-uuid-abc',
      locationId: 'LOC_X',
      redirectUrl: 'https://example.com/done'
    })
    const call = mockCreate.mock.calls[0][0]
    expect(call.order.locationId).toBe('LOC_X')
    expect(call.order.referenceId).toBe('cart-uuid-abc')
    expect(call.order.metadata).toEqual({ cart_id: 'cart-uuid-abc' })
    expect(call.order.lineItems).toHaveLength(2)
    expect(call.order.lineItems[0]).toEqual({ catalogObjectId: 'V_A', quantity: '2' })
    expect(call.order.lineItems[1]).toEqual({ catalogObjectId: 'V_B', quantity: '1' })
  })

  it('passes checkoutOptions.redirectUrl to Square', async () => {
    mockCreate.mockResolvedValue(OK_RESPONSE)
    await createPaymentLink({
      lines: LINES,
      cartId: 'cart-uuid',
      locationId: 'LOC_X',
      redirectUrl: 'https://dev.animeniacs.shop/checkout/success'
    })
    expect(mockCreate.mock.calls[0][0].checkoutOptions.redirectUrl).toBe(
      'https://dev.animeniacs.shop/checkout/success'
    )
  })

  it('asks Square to collect the buyer shipping address (askForShippingAddress: true)', async () => {
    mockCreate.mockResolvedValue(OK_RESPONSE)
    await createPaymentLink({
      lines: LINES,
      cartId: 'cart-uuid',
      locationId: 'LOC_X',
      redirectUrl: 'https://dev.animeniacs.shop/checkout/success'
    })
    const opts = mockCreate.mock.calls[0][0].checkoutOptions
    expect(opts.askForShippingAddress).toBe(true)
    // Still keeps the existing redirect (regression guard for the happy path).
    expect(opts.redirectUrl).toBe('https://dev.animeniacs.shop/checkout/success')
  })

  it('adds the flat $10 US shipping fee to checkoutOptions', async () => {
    mockCreate.mockResolvedValue(OK_RESPONSE)
    await createPaymentLink({
      lines: LINES,
      cartId: 'cart-uuid',
      locationId: 'LOC_X',
      redirectUrl: 'https://dev.animeniacs.shop/checkout/success'
    })
    const opts = mockCreate.mock.calls[0][0].checkoutOptions
    expect(opts.shippingFee).toEqual({
      name: 'Shipping',
      charge: { amount: 1000n, currency: 'USD' }
    })
  })

  it('throws if Square response lacks paymentLink.url', async () => {
    mockCreate.mockResolvedValue({ paymentLink: { url: null, orderId: 'ORDER_X' } })
    await expect(
      createPaymentLink({
        lines: LINES,
        cartId: 'cart-uuid',
        locationId: 'LOC_X',
        redirectUrl: 'https://x'
      })
    ).rejects.toThrow(/payment link/i)
  })

  it('throws if Square response lacks paymentLink.orderId', async () => {
    mockCreate.mockResolvedValue({
      paymentLink: { url: 'https://sandbox.squareup.com/checkout/x', orderId: null }
    })
    await expect(
      createPaymentLink({
        lines: LINES,
        cartId: 'cart-uuid',
        locationId: 'LOC_X',
        redirectUrl: 'https://x'
      })
    ).rejects.toThrow(/order id/i)
  })
})
