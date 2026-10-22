import 'server-only'
import type { CheckoutAddress } from '@/lib/shipping/address'
import { fullName, toSquareAddress } from '@/lib/shipping/address'
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
  /**
   * Buyer shipping address, collected + validated on-site. Becomes the
   * recipient of the order's SHIPMENT fulfillment, which is what makes the
   * order show under "Shipments" in the Square dashboard and lets Square show
   * the ship-to on its hosted page without asking again.
   */
  shippingAddress: CheckoutAddress
  /**
   * Carrier + service the buyer picked (from the priced Shippo rate), when
   * there is one. Recorded on the fulfillment for the dashboard; null/absent
   * for flat-fee carts (decals-only, Shippo fallback).
   */
  shippingSelection?: { carrier: string; service: string } | null
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
  // Square only accepts E.164 (`+1404…`); a bare "4045550000" is rejected with
  // INVALID_PHONE_NUMBER and would fail the whole checkout. The phone is an
  // optional nicety, so normalize it and DROP it rather than ever block payment.
  const buyerPhone = toE164Phone(addr.phone, addr.country)
  // Shipping rides on the Order as a fixed TOTAL_PHASE service charge — NOT as
  // `checkoutOptions.shippingFee`. Square now rejects a checkout-level shipping
  // fee combined with `askForShippingAddress: false` ("AskForShippingAddress
  // cannot be set to 'false' if ShippingFee is present"), and we must keep the
  // address prompt off because we already collected + validated the ship-to.
  // The order total is identical either way. Omit it entirely for free shipping.
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

  // Explicit SHIPMENT fulfillment. Without it Square auto-attaches a DIGITAL
  // fulfillment ("Other" in the dashboard) and the order never reaches the
  // Shipments to-do list. The old checkout-level shippingFee used to create
  // this implicitly. Square forbids `prePopulatedData` alongside a fulfillment
  // (CONFLICTING_PARAMETERS), so the recipient carries the buyer's name,
  // contact and address instead — Square shows them on the hosted page.
  const fulfillments = [
    {
      type: 'SHIPMENT' as const,
      state: 'PROPOSED' as const,
      shipmentDetails: {
        recipient: {
          displayName: fullName(addr),
          ...(addr.email ? { emailAddress: addr.email } : {}),
          ...(buyerPhone ? { phoneNumber: buyerPhone } : {}),
          // Square types Address.country as a Country enum; we pass a validated
          // ISO-3166-1 alpha-2 string (same value space).
          // biome-ignore lint/suspicious/noExplicitAny: SDK Country enum vs ISO string
          address: toSquareAddress(addr) as any
        },
        ...(args.shippingSelection?.carrier ? { carrier: args.shippingSelection.carrier } : {}),
        ...(args.shippingSelection?.service ? { shippingType: args.shippingSelection.service } : {})
      }
    }
  ]

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
      fulfillments,
      metadata: { cart_id: args.cartId }
    },
    checkoutOptions: {
      redirectUrl: args.redirectUrl,
      // We already collected + validated the address on our site (Shippo step),
      // so Square must NOT ask again. The chosen shipping is charged on the order.
      askForShippingAddress: false
    }
    // NO prePopulatedData: Square rejects it when the order carries a
    // fulfillment ("Only one of [fulfillment, buyer_address] fields should be
    // set"). The fulfillment recipient above is the pre-fill now.
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
