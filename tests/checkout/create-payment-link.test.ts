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

  it('does NOT ask Square for the address and sends NO prePopulatedData (Square rejects it beside a fulfillment)', async () => {
    mockCreate.mockResolvedValue(OK_RESPONSE)
    await createPaymentLink(BASE)
    const call = mockCreate.mock.calls[0][0]
    expect(call.checkoutOptions.askForShippingAddress).toBe(false)
    expect(call).not.toHaveProperty('prePopulatedData')
  })

  it('attaches a PROPOSED SHIPMENT fulfillment whose recipient is the validated ship-to (so the order lands in Square "Shipments")', async () => {
    mockCreate.mockResolvedValue(OK_RESPONSE)
    await createPaymentLink({
      ...BASE,
      shippingSelection: { carrier: 'USPS', service: 'Ground Advantage' }
    })
    const call = mockCreate.mock.calls[0][0]
    expect(call.order.fulfillments).toEqual([
      {
        type: 'SHIPMENT',
        state: 'PROPOSED',
        shipmentDetails: {
          recipient: {
            displayName: 'Buyer One',
            emailAddress: 'buyer@example.com',
            // Square only accepts E.164 — a bare US number must be prefixed, not passed through.
            phoneNumber: '+14045550000',
            address: {
              addressLine1: '500 W Temple St',
              addressLine2: 'Apt 4',
              locality: 'Los Angeles',
              administrativeDistrictLevel1: 'CA',
              postalCode: '90012',
              country: 'US'
            }
          },
          carrier: 'USPS',
          shippingType: 'Ground Advantage'
        }
      }
    ])
  })

  it('omits carrier/shippingType on the fulfillment for flat-fee carts (no selection)', async () => {
    mockCreate.mockResolvedValue(OK_RESPONSE)
    await createPaymentLink({ ...BASE, shippingSelection: null })
    const details = mockCreate.mock.calls[0][0].order.fulfillments[0].shipmentDetails
    expect(details).not.toHaveProperty('carrier')
    expect(details).not.toHaveProperty('shippingType')
    expect(details.recipient.displayName).toBe('Buyer One')
  })

  it('drops an un-normalizable phone from the recipient instead of failing the checkout', async () => {
    mockCreate.mockResolvedValue(OK_RESPONSE)
    await createPaymentLink({ ...BASE, shippingAddress: { ...ADDRESS, phone: '555' } })
    const recipient = mockCreate.mock.calls[0][0].order.fulfillments[0].shipmentDetails.recipient
    expect(recipient).not.toHaveProperty('phoneNumber')
    expect(recipient.emailAddress).toBe('buyer@example.com')
  })

  it('omits recipient email and phone when the buyer left them blank', async () => {
    mockCreate.mockResolvedValue(OK_RESPONSE)
    await createPaymentLink({ ...BASE, shippingAddress: { ...ADDRESS, phone: '', email: '' } })
    const recipient = mockCreate.mock.calls[0][0].order.fulfillments[0].shipmentDetails.recipient
    expect(recipient).not.toHaveProperty('phoneNumber')
    expect(recipient).not.toHaveProperty('emailAddress')
    expect(recipient.address.postalCode).toBe('90012')
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
