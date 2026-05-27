import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))
vi.mock('@/lib/square/client', () => ({
  getSquareClient: () => ({ checkout: { paymentLinks: { create: mockCreate } } })
}))

import { createPaymentLink } from '@/lib/checkout/create-payment-link'

beforeEach(() => {
  mockCreate.mockReset()
})

describe('createPaymentLink', () => {
  it('returns checkoutUrl on success', async () => {
    mockCreate.mockResolvedValue({ paymentLink: { url: 'https://sandbox.squareup.com/...' } })
    const result = await createPaymentLink({
      orderId: 'ORDER_X',
      redirectUrl: 'https://dev.animeniacs.shop/checkout/success'
    })
    expect(result.checkoutUrl).toBe('https://sandbox.squareup.com/...')
  })

  it('passes orderId + redirectUrl to Square', async () => {
    mockCreate.mockResolvedValue({ paymentLink: { url: 'https://sandbox.squareup.com/x' } })
    await createPaymentLink({ orderId: 'ORDER_Y', redirectUrl: 'https://example.com/done' })
    const call = mockCreate.mock.calls[0][0]
    expect(call.orderId).toBe('ORDER_Y')
    expect(call.checkoutOptions.redirectUrl).toBe('https://example.com/done')
  })

  it('uses orderId as idempotencyKey (re-call returns same link)', async () => {
    mockCreate.mockResolvedValue({ paymentLink: { url: 'https://...' } })
    await createPaymentLink({ orderId: 'ORDER_Z', redirectUrl: 'https://example.com/done' })
    expect(mockCreate.mock.calls[0][0].idempotencyKey).toBe('ORDER_Z')
  })

  it('throws if Square response lacks paymentLink.url', async () => {
    mockCreate.mockResolvedValue({ paymentLink: { url: null } })
    await expect(
      createPaymentLink({ orderId: 'ORDER_X', redirectUrl: 'https://x' })
    ).rejects.toThrow(/payment link/i)
  })
})
