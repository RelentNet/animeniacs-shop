import { validateCart } from '@/lib/checkout/validate-cart'
import { CheckoutAddressSchema, toShippoAddress } from '@/lib/shipping/address'
import { isShippable } from '@/lib/shipping/countries'
import { quoteRates } from '@/lib/shipping/quote'
import { NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * Live shipping rates for the on-site checkout step. The buyer's address +
 * current cart come in; we enforce the shippable-country allowlist, re-validate
 * prices, then return live carrier rates (markup + decal fee folded in) for the
 * buyer to pick — OR a flat amount for decals-only carts / rating failures.
 *
 * Quotes only; no label is purchased here.
 */
const RequestSchema = z.object({
  items: z
    .array(
      z.object({
        catalogItemId: z.string().min(1),
        variationId: z.string().min(1),
        quantity: z.number().int().positive(),
        expectedUnitPriceCents: z.number().int().nonnegative()
      })
    )
    .min(1)
    .max(50),
  shippingAddress: CheckoutAddressSchema
})

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { shippingAddress } = parsed.data
  if (!isShippable(shippingAddress.country)) {
    return NextResponse.json(
      { error: 'country_not_shippable', message: 'We do not ship to that country yet.' },
      { status: 422 }
    )
  }

  try {
    const validation = await validateCart(parsed.data.items)
    if (!validation.ok) {
      return NextResponse.json(
        { error: 'price_changed', mismatches: validation.mismatches },
        { status: 409 }
      )
    }

    const quote = await quoteRates(toShippoAddress(shippingAddress), validation.lines)
    return NextResponse.json(quote)
  } catch (err) {
    console.error('[shipping/rates] failure:', err)
    return NextResponse.json(
      { error: 'Could not fetch shipping rates. Please try again.' },
      { status: 500 }
    )
  }
}
