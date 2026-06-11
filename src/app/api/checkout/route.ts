import { randomUUID } from 'node:crypto'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { createPaymentLink } from '@/lib/checkout/create-payment-link'
import { validateCart } from '@/lib/checkout/validate-cart'
import { createPendingCart } from '@/lib/db/queries/abandoned-carts'
import { findOrCreateSquareCustomer } from '@/lib/square/customers'
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

  // Capture buyer identity for logged-in users (Phase 15: better-auth session).
  // Email feeds abandoned-cart recovery; the user id + name drive the Square
  // customer mapping. getCurrentUser returns nulls for anonymous/guest checkout
  // and never throws (unchanged guest behavior).
  const currentUser = await getCurrentUser()
  const buyerEmail: string | null = currentUser.email
  const buyerUserId: string | null = currentUser.userId
  const buyerName: string | null = currentUser.name

  // Map the signed-in buyer to a Square customer. BEST-EFFORT (spec §8): a
  // Customers-API failure must never block payment — log + continue with no
  // customerId so checkout still proceeds.
  let customerId: string | undefined
  if (buyerUserId) {
    try {
      customerId = await findOrCreateSquareCustomer({
        userId: buyerUserId,
        email: buyerEmail,
        name: buyerName
      })
    } catch (err) {
      console.error('[checkout] Square customer mapping failed (continuing):', err)
    }
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
      redirectUrl: `${siteUrl}/checkout/success?cartId=${cartId}`,
      customerId
    })

    await createPendingCart({
      cartId,
      squareOrderId: orderId,
      cartSnapshot: { items: parsed.data.items },
      buyerEmail,
      buyerUserId,
      squareCustomerId: customerId ?? null
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
