import { randomUUID } from 'node:crypto'
import { createPaymentLink } from '@/lib/checkout/create-payment-link'
import { validateCart } from '@/lib/checkout/validate-cart'
import { createPendingCart } from '@/lib/db/queries/abandoned-carts'
import { NextResponse } from 'next/server'
import { z } from 'zod'

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
    .max(50)
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

  const locationId = process.env.SQUARE_LOCATION_ID
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!locationId || !siteUrl) {
    console.error('[checkout] missing SQUARE_LOCATION_ID or NEXT_PUBLIC_SITE_URL')
    return NextResponse.json(
      { error: 'Could not start checkout. Please try again.' },
      { status: 500 }
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

    const cartId = randomUUID()
    const { checkoutUrl, orderId } = await createPaymentLink({
      lines: validation.lines,
      cartId,
      locationId,
      redirectUrl: `${siteUrl}/checkout/success?cartId=${cartId}`
    })

    await createPendingCart({
      cartId,
      squareOrderId: orderId,
      cartSnapshot: { items: parsed.data.items },
      buyerEmail: null
    })

    return NextResponse.json({ checkoutUrl, cartId })
  } catch (err) {
    console.error('[checkout] failure:', err)
    return NextResponse.json(
      { error: 'Could not start checkout. Please try again.' },
      { status: 500 }
    )
  }
}
