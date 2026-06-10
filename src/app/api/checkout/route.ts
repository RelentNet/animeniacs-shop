import { randomUUID } from 'node:crypto'
import { createPaymentLink } from '@/lib/checkout/create-payment-link'
import { validateCart } from '@/lib/checkout/validate-cart'
import { createPendingCart } from '@/lib/db/queries/abandoned-carts'
import { logtoConfig } from '@/lib/logto'
import { findOrCreateSquareCustomer } from '@/lib/square/customers'
import { getLogtoContext } from '@logto/next/server-actions'
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

  // Capture buyer identity for logged-in users. Email feeds abandoned-cart
  // recovery; the sub + name drive the Logto↔Square customer mapping. All fall
  // back to null for anonymous/guest checkout (unchanged guest behavior).
  let buyerEmail: string | null = null
  let buyerUserId: string | null = null
  let buyerName: string | null = null
  try {
    const ctx = await getLogtoContext(logtoConfig)
    const email = ctx?.claims?.email
    if (typeof email === 'string' && email.length > 0) {
      buyerEmail = email
    }
    const sub = ctx?.claims?.sub
    if (typeof sub === 'string' && sub.length > 0) {
      buyerUserId = sub
    }
    const name = ctx?.claims?.name
    if (typeof name === 'string' && name.length > 0) {
      buyerName = name
    }
  } catch {
    // Not signed in or Logto unavailable — continue with null identity
  }

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
