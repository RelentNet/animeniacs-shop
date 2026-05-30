import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifySquareSignature } from '@/lib/webhooks/verify-signature'

const KEY = 'super-secret-signature-key'
const URL = 'https://dev.animeniacs.shop/api/webhooks/square'
const BODY = '{"event_id":"abc","type":"payment.created"}'

function sign(body: string, url: string, key: string) {
  return createHmac('sha256', key)
    .update(url + body)
    .digest('base64')
}

describe('verifySquareSignature', () => {
  it('returns true for a valid signature', () => {
    const sig = sign(BODY, URL, KEY)
    expect(
      verifySquareSignature({
        rawBody: BODY,
        signatureHeader: sig,
        notificationUrl: URL,
        signatureKey: KEY
      })
    ).toBe(true)
  })

  it('returns false for a wrong signature', () => {
    expect(
      verifySquareSignature({
        rawBody: BODY,
        signatureHeader: 'wrong',
        notificationUrl: URL,
        signatureKey: KEY
      })
    ).toBe(false)
  })

  it('returns false when body is tampered', () => {
    const sig = sign(BODY, URL, KEY)
    expect(
      verifySquareSignature({
        rawBody: `${BODY} `,
        signatureHeader: sig,
        notificationUrl: URL,
        signatureKey: KEY
      })
    ).toBe(false)
  })

  it('returns false when url is tampered', () => {
    const sig = sign(BODY, URL, KEY)
    expect(
      verifySquareSignature({
        rawBody: BODY,
        signatureHeader: sig,
        notificationUrl: `${URL}x`,
        signatureKey: KEY
      })
    ).toBe(false)
  })

  it('returns false for empty signature header', () => {
    expect(
      verifySquareSignature({
        rawBody: BODY,
        signatureHeader: '',
        notificationUrl: URL,
        signatureKey: KEY
      })
    ).toBe(false)
  })
})
