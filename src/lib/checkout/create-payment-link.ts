import 'server-only'
import { getSquareClient } from '@/lib/square/client'
import type { ValidatedLine } from './validate-cart'

/**
 * Interim flat shipping fee (cents), charged on every order. $10 flat for the
 * US (incl. PR/AK); international is not offered yet and is communicated at
 * checkout. This is the stopgap until the Shippo dynamic-rate integration —
 * which will collect the address on-site, quote live carrier rates, and enforce
 * shippable countries before payment. Square's hosted checkout has no country
 * restriction, so hard international-blocking arrives with that on-site step.
 */
const FLAT_SHIPPING_CENTS = 1000n

export interface CreatePaymentLinkArgs {
  /** Validated cart lines (post validateCart). */
  lines: ValidatedLine[]
  /** Our generated cart UUID. Used as the idempotency key AND as the Square Order's referenceId + metadata.cart_id. */
  cartId: string
  /** Square sandbox/prod location ID — from SQUARE_LOCATION_ID env. */
  locationId: string
  /** Where Square should redirect after payment — e.g. https://dev.animeniacs.shop/checkout/success */
  redirectUrl: string
  /** Square customer id to attribute the order to (logged-in buyers). Optional. */
  customerId?: string
}

export interface CreatePaymentLinkResult {
  /** Hosted Square checkout URL the buyer is redirected to. */
  checkoutUrl: string
  /** Square-assigned order id. Square creates the order atomically with the payment link. */
  orderId: string
}

export async function createPaymentLink(
  args: CreatePaymentLinkArgs
): Promise<CreatePaymentLinkResult> {
  const client = getSquareClient()
  const response = await client.checkout.paymentLinks.create({
    idempotencyKey: args.cartId,
    order: {
      locationId: args.locationId,
      referenceId: args.cartId,
      ...(args.customerId ? { customerId: args.customerId } : {}),
      lineItems: args.lines.map((line) => ({
        catalogObjectId: line.variationId,
        quantity: String(line.quantity)
      })),
      metadata: { cart_id: args.cartId }
    },
    checkoutOptions: {
      redirectUrl: args.redirectUrl,
      askForShippingAddress: true,
      shippingFee: { name: 'Shipping', charge: { amount: FLAT_SHIPPING_CENTS, currency: 'USD' } }
    }
  })
  // biome-ignore lint/suspicious/noExplicitAny: SDK return shape varies
  const link = (response as any).paymentLink
  const url: string | undefined = link?.url
  const orderId: string | undefined = link?.orderId
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('Square checkout.paymentLinks.create returned no payment link URL')
  }
  if (typeof orderId !== 'string' || orderId.length === 0) {
    throw new Error('Square checkout.paymentLinks.create returned no order id')
  }
  return { checkoutUrl: url, orderId }
}
