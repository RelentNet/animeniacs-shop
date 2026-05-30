import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

export interface VerifySignatureArgs {
  rawBody: string
  signatureHeader: string
  notificationUrl: string
  signatureKey: string
}

export function verifySquareSignature(args: VerifySignatureArgs): boolean {
  if (!args.signatureHeader || !args.signatureKey) return false
  const expected = createHmac('sha256', args.signatureKey)
    .update(args.notificationUrl + args.rawBody)
    .digest('base64')
  const a = Buffer.from(expected)
  const b = Buffer.from(args.signatureHeader)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
