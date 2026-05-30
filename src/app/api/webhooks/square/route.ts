import { handleSquareEvent } from '@/lib/webhooks/handle-event'
import { verifySquareSignature } from '@/lib/webhooks/verify-signature'
import { NextResponse } from 'next/server'

export async function POST(request: Request): Promise<NextResponse> {
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!signatureKey || !siteUrl) {
    console.error('[webhook] missing SQUARE_WEBHOOK_SIGNATURE_KEY or NEXT_PUBLIC_SITE_URL')
    return new NextResponse(null, { status: 500 })
  }

  // Square computes the HMAC over the EXACT URL it called + the raw body
  // bytes. Reconstructing the notification URL from headers is fragile
  // behind proxies; trust NEXT_PUBLIC_SITE_URL as the canonical base
  // and append the known path.
  const notificationUrl = `${siteUrl}/api/webhooks/square`

  const rawBody = await request.text()
  const signature = request.headers.get('x-square-hmacsha256-signature') ?? ''
  const valid = verifySquareSignature({
    rawBody,
    signatureHeader: signature,
    notificationUrl,
    signatureKey
  })
  if (!valid) return new NextResponse(null, { status: 401 })

  let event: unknown
  try {
    event = JSON.parse(rawBody)
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  try {
    await handleSquareEvent({
      event,
      webhookUrl: notificationUrl,
      signatureKey
    })
    return new NextResponse(null, { status: 200 })
  } catch (err) {
    console.error('[webhook] handler failed:', err)
    // 5xx tells Square to retry. Don't echo error details.
    return new NextResponse(null, { status: 500 })
  }
}
