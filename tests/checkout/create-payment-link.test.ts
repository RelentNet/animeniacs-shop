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
  {
    catalogItemId: 'A',
    variationId: 'V_A',
    quantity: 2,
    unitPriceCents: 2500,
    name: 'Item A',
    variationName: 'Acrylic Wall Art',
    categoryIds: ['cat-acr']
  },
  {
    catalogItemId: 'B',
    variationId: 'V_B',
    quantity: 1,
    unitPriceCents: 3000,
    name: 'Item B',
    variationName: 'Acrylic Wall Art',
    categoryIds: ['cat-acr']
  }
]

const ADDRESS = {
  firstName: 'Buyer',
  lastName: 'One',
  line1: '500 W Temple St',
  line2: 'Apt 4',
  city: 'Los Angeles',
  state: 'CA',
  zip: '90012',
  country: 'US',
  phone: '4045550000',
  email: 'buyer@example.com'
}

const BASE = {
  lines: LINES,
  cartId: 'cart-uuid',
  locationId: 'LOC_X',
  redirectUrl: 'https://dev.animeniacs.shop/checkout/success',
  shippingCents: 1835,
  shippingAddress: ADDRESS
}

const OK_RESPONSE = {
  paymentLink: { url: 'https://sandbox.squareup.com/checkout/abc', orderId: 'ORDER_X' }
}

describe('createPaymentLink', () => {
  it('returns checkoutUrl and orderId on success', async () => {
    mockCreate.mockResolvedValue(OK_RESPONSE)
    const result = await createPaymentLink(BASE)
    expect(result).toEqual({
      checkoutUrl: 'https://sandbox.squareup.com/checkout/abc',
      orderId: 'ORDER_X'
    })
  })

  it('uses idempotencyKey = cartId so retries do not double-create', async () => {
    mockCreate.mockResolvedValue(OK_RESPONSE)
    await createPaymentLink({ ...BASE, cartId: 'cart-uuid-idem' })
    expect(mockCreate.mock.calls[0][0].idempotencyKey).toBe('cart-uuid-idem')
  })

  it('embeds order inline with locationId, referenceId, lineItems, and metadata.cart_id', async () => {
    mockCreate.mockResolvedValue(OK_RESPONSE)
    await createPaymentLink({ ...BASE, cartId: 'cart-uuid-abc' })
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
    await createPaymentLink(BASE)
    expect(mockCreate.mock.calls[0][0].checkoutOptions.redirectUrl).toBe(
      'https://dev.animeniacs.shop/checkout/success'
    )
  })

  it('does NOT ask Square for the address (we collected it) and pre-populates it', async () => {
    mockCreate.mockResolvedValue(OK_RESPONSE)
    await createPaymentLink(BASE)
    const call = mockCreate.mock.calls[0][0]
    expect(call.checkoutOptions.askForShippingAddress).toBe(false)
    expect(call.prePopulatedData.buyerEmail).toBe('buyer@example.com')
    // Square only accepts E.164 — a bare US number must be prefixed, not passed through.
    expect(call.prePopulatedData.buyerPhoneNumber).toBe('+14045550000')
    expect(call.prePopulatedData.buyerAddress).toEqual({
      addressLine1: '500 W Temple St',
      addressLine2: 'Apt 4',
      locality: 'Los Angeles',
      administrativeDistrictLevel1: 'CA',
      postalCode: '90012',
      country: 'US'
    })
  })

  it('drops an un-normalizable phone instead of failing the checkout', async () => {
    mockCreate.mockResolvedValue(OK_RESPONSE)
    await createPaymentLink({ ...BASE, shippingAddress: { ...ADDRESS, phone: '555' } })
    const pre = mockCreate.mock.calls[0][0].prePopulatedData
    expect(pre).not.toHaveProperty('buyerPhoneNumber')
    expect(pre.buyerEmail).toBe('buyer@example.com')
  })

  it('omits buyerPhoneNumber when the buyer left the phone blank', async () => {
    mockCreate.mockResolvedValue(OK_RESPONSE)
    await createPaymentLink({ ...BASE, shippingAddress: { ...ADDRESS, phone: '' } })
    expect(mockCreate.mock.calls[0][0].prePopulatedData).not.toHaveProperty('buyerPhoneNumber')
  })

  it('charges the priced shipping as a fixed "Shipping" service charge on the ORDER (bigint cents)', async () => {
    mockCreate.mockResolvedValue(OK_RESPONSE)
    await createPaymentLink({ ...BASE, shippingCents: 1835 })
    const call = mockCreate.mock.calls[0][0]
    expect(call.order.serviceCharges).toEqual([
      {
        name: 'Shipping',
        amountMoney: { amount: 1835n, currency: 'USD' },
        calculationPhase: 'TOTAL_PHASE',
        taxable: false
      }
    ])
  })

  it('NEVER sets checkoutOptions.shippingFee (Square rejects it with askForShippingAddress=false)', async () => {
    mockCreate.mockResolvedValue(OK_RESPONSE)
    await createPaymentLink({ ...BASE, shippingCents: 1835 })
    const opts = mockCreate.mock.calls[0][0].checkoutOptions
    expect(opts).not.toHaveProperty('shippingFee')
    expect(opts.askForShippingAddress).toBe(false)
  })

  it('omits the service charge entirely when shipping is free ($0)', async () => {
    mockCreate.mockResolvedValue(OK_RESPONSE)
    await createPaymentLink({ ...BASE, shippingCents: 0 })
    const call = mockCreate.mock.calls[0][0]
    expect(call.order).not.toHaveProperty('serviceCharges')
    expect(call.checkoutOptions).not.toHaveProperty('shippingFee')
    expect(call.checkoutOptions.askForShippingAddress).toBe(false)
  })

  it('throws if Square response lacks paymentLink.url', async () => {
    mockCreate.mockResolvedValue({ paymentLink: { url: null, orderId: 'ORDER_X' } })
    await expect(createPaymentLink(BASE)).rejects.toThrow(/payment link/i)
  })

  it('throws if Square response lacks paymentLink.orderId', async () => {
    mockCreate.mockResolvedValue({
      paymentLink: { url: 'https://sandbox.squareup.com/checkout/x', orderId: null }
    })
    await expect(createPaymentLink(BASE)).rejects.toThrow(/order id/i)
  })
})
