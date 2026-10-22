import 'server-only'
import type { CheckoutAddress } from '@/lib/shipping/address'
import { toSquareAddress } from '@/lib/shipping/address'
import { toE164Phone } from '@/lib/shipping/phone'
import { getSquareClient } from '@/lib/square/client'
import type { ValidatedLine } from './validate-cart'

export interface CreatePaymentLinkArgs {
  /** Validated cart lines (post validateCart). */
  lines: ValidatedLine[]
  /** Our generated cart UUID. Used as the idempotency key AND as the Square Order's referenceId + metadata.cart_id. */
  cartId: string
  /** Square sandbox/prod location ID — from SQUARE_LOCATION_ID env. */
  locationId: string
  /** Where Square should redirect after payment — e.g. https://dev.animeniacs.shop/checkout/success */
  redirectUrl: string
  /**
   * Final shipping charge in cents (carrier rate + markup + decal fee, OR the
   * flat fallback). Priced server-side from the buyer's chosen Shippo rate and
   * attached to the Order as a fixed "Shipping" service charge, so Square folds
   * it into the order total.
   */
  shippingCents: number
  /** Buyer shipping address, collected on-site → pre-fills Square so it isn't re-asked. */
  shippingAddress: CheckoutAddress
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
  const addr = args.shippingAddress
  const buyerEmail = addr.email || undefined
  // Square only accepts E.164 (`+1404…`); a bare "4045550000" is rejected with
  // INVALID_PHONE_NUMBER and would fail the whole checkout. The phone is an
  // optional pre-fill, so normalize it and DROP it rather than ever block payment.
  const buyerPhone = toE164Phone(addr.phone, addr.country)
  // Shipping rides on the Order as a fixed TOTAL_PHASE service charge — NOT as
  // `checkoutOptions.shippingFee`. Square now rejects a checkout-level shipping
  // fee combined with `askForShippingAddress: false` ("AskForShippingAddress
  // cannot be set to 'false' if ShippingFee is present"), and we must keep the
  // address prompt off because we already collected + validated the ship-to.
  // The order total is identical either way (Square booked the old shippingFee
  // as a service charge internally too). Omit it entirely for free shipping.
  const shippingCents = Math.max(0, Math.round(args.shippingCents))
  const serviceCharges =
    shippingCents > 0
      ? [
          {
            name: 'Shipping',
            amountMoney: { amount: BigInt(shippingCents), currency: 'USD' as const },
            calculationPhase: 'TOTAL_PHASE' as const,
            taxable: false
          }
        ]
      : undefined

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
      ...(serviceCharges ? { serviceCharges } : {}),
      metadata: { cart_id: args.cartId }
    },
    checkoutOptions: {
      redirectUrl: args.redirectUrl,
      // We already collected + validated the address on our site (Shippo step),
      // so Square must NOT ask again. The chosen shipping is charged on the order.
      askForShippingAddress: false
    },
    // Pre-fill the buyer's validated shipping address + contact on Square's page.
    prePopulatedData: {
      ...(buyerEmail ? { buyerEmail } : {}),
      ...(buyerPhone ? { buyerPhoneNumber: buyerPhone } : {}),
      // Square types Address.country as a Country enum; we pass a validated
      // ISO-3166-1 alpha-2 string (same value space).
      // biome-ignore lint/suspicious/noExplicitAny: SDK Country enum vs ISO string
      buyerAddress: toSquareAddress(addr) as any
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
