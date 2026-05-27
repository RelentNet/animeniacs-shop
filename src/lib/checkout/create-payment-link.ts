import 'server-only'
import { getSquareClient } from '@/lib/square/client'

export interface CreatePaymentLinkArgs {
  orderId: string
  redirectUrl: string
}

export async function createPaymentLink(
  args: CreatePaymentLinkArgs
): Promise<{ checkoutUrl: string }> {
  const client = getSquareClient()
  const response = await client.checkout.paymentLinks.create({
    idempotencyKey: args.orderId,
    orderId: args.orderId,
    checkoutOptions: { redirectUrl: args.redirectUrl }
  })
  // biome-ignore lint/suspicious/noExplicitAny: SDK return shape varies
  const url = (response as any).paymentLink?.url
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('Square checkout.paymentLinks.create returned no payment link URL')
  }
  return { checkoutUrl: url }
}
