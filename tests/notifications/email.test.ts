import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSend = vi.fn()

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: mockSend } }))
}))

describe('sendAbandonedCartEmail', () => {
  beforeEach(() => {
    mockSend.mockReset()
    mockSend.mockResolvedValue({ data: { id: 'email-id-123' }, error: null })
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubEnv('RESEND_FROM_EMAIL', 'noreply@animeniacs.shop')
  })

  it('calls Resend with correct to, subject, and shop link', async () => {
    const { sendAbandonedCartEmail } = await import('@/lib/notifications/email')
    await sendAbandonedCartEmail({
      to: 'buyer@example.com',
      cartSnapshot: { items: [{ catalogItemId: 'ITEM_1', quantity: 2 }] },
      shopUrl: 'https://dev.animeniacs.shop'
    })
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'buyer@example.com',
        subject: expect.stringContaining('left'),
        text: expect.stringContaining('https://dev.animeniacs.shop/shop')
      })
    )
  })

  it('silently no-ops when RESEND_API_KEY is absent', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const { sendAbandonedCartEmail } = await import('@/lib/notifications/email')
    await expect(
      sendAbandonedCartEmail({
        to: 'buyer@example.com',
        cartSnapshot: { items: [] },
        shopUrl: 'https://dev.animeniacs.shop'
      })
    ).resolves.toBeUndefined()
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('silently no-ops when RESEND_FROM_EMAIL is absent', async () => {
    vi.stubEnv('RESEND_FROM_EMAIL', '')
    const { sendAbandonedCartEmail } = await import('@/lib/notifications/email')
    await expect(
      sendAbandonedCartEmail({
        to: 'buyer@example.com',
        cartSnapshot: { items: [] },
        shopUrl: 'https://dev.animeniacs.shop'
      })
    ).resolves.toBeUndefined()
    expect(mockSend).not.toHaveBeenCalled()
  })
})

describe('sendOrderConfirmationEmail', () => {
  beforeEach(() => {
    mockSend.mockReset()
    mockSend.mockResolvedValue({ data: { id: 'email-id-123' }, error: null })
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubEnv('RESEND_FROM_EMAIL', 'noreply@animeniacs.shop')
  })

  it('calls Resend with a receipt subject + body containing items, total, and lookup links', async () => {
    const { sendOrderConfirmationEmail } = await import('@/lib/notifications/email')
    await sendOrderConfirmationEmail({
      to: 'buyer@example.com',
      orderId: 'ORDER_X',
      items: [
        { name: 'Sticker Pack', quantity: 2, totalCents: 2000 },
        { name: 'Poster', quantity: 1, totalCents: 599 }
      ],
      totalCents: 2599,
      shopUrl: 'https://dev.animeniacs.shop'
    })
    expect(mockSend).toHaveBeenCalledTimes(1)
    const arg = mockSend.mock.calls[0][0]
    expect(arg.to).toBe('buyer@example.com')
    expect(arg.subject).toMatch(/order|receipt|confirm/i)
    expect(arg.subject).toContain('ORDER_X')
    expect(arg.text).toContain('Sticker Pack')
    expect(arg.text).toContain('Poster')
    expect(arg.text).toContain('$25.99')
    expect(arg.text).toContain('ORDER_X')
    expect(arg.text).toContain('https://dev.animeniacs.shop/account/orders')
    expect(arg.text).toContain('https://dev.animeniacs.shop/orders/lookup')
  })

  it('silently no-ops when RESEND_API_KEY is absent', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const { sendOrderConfirmationEmail } = await import('@/lib/notifications/email')
    await expect(
      sendOrderConfirmationEmail({
        to: 'buyer@example.com',
        orderId: 'ORDER_X',
        items: [],
        totalCents: 0,
        shopUrl: 'https://dev.animeniacs.shop'
      })
    ).resolves.toBeUndefined()
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('silently no-ops when RESEND_FROM_EMAIL is absent', async () => {
    vi.stubEnv('RESEND_FROM_EMAIL', '')
    const { sendOrderConfirmationEmail } = await import('@/lib/notifications/email')
    await expect(
      sendOrderConfirmationEmail({
        to: 'buyer@example.com',
        orderId: 'ORDER_X',
        items: [],
        totalCents: 0,
        shopUrl: 'https://dev.animeniacs.shop'
      })
    ).resolves.toBeUndefined()
    expect(mockSend).not.toHaveBeenCalled()
  })
})

describe('sendRefundEmail', () => {
  beforeEach(() => {
    mockSend.mockReset()
    mockSend.mockResolvedValue({ data: { id: 'email-id-123' }, error: null })
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubEnv('RESEND_FROM_EMAIL', 'noreply@animeniacs.shop')
  })

  it('calls Resend with a refund subject + body containing the refunded amount and order id', async () => {
    const { sendRefundEmail } = await import('@/lib/notifications/email')
    await sendRefundEmail({
      to: 'buyer@example.com',
      orderId: 'ORDER_X',
      refundedCents: 500,
      totalCents: 2599,
      shopUrl: 'https://dev.animeniacs.shop'
    })
    expect(mockSend).toHaveBeenCalledTimes(1)
    const arg = mockSend.mock.calls[0][0]
    expect(arg.to).toBe('buyer@example.com')
    expect(arg.subject).toMatch(/refund/i)
    expect(arg.text).toContain('$5.00')
    expect(arg.text).toContain('ORDER_X')
  })

  it('silently no-ops when RESEND_API_KEY is absent', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const { sendRefundEmail } = await import('@/lib/notifications/email')
    await expect(
      sendRefundEmail({
        to: 'buyer@example.com',
        orderId: 'ORDER_X',
        refundedCents: 500,
        totalCents: 2599,
        shopUrl: 'https://dev.animeniacs.shop'
      })
    ).resolves.toBeUndefined()
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('silently no-ops when RESEND_FROM_EMAIL is absent', async () => {
    vi.stubEnv('RESEND_FROM_EMAIL', '')
    const { sendRefundEmail } = await import('@/lib/notifications/email')
    await expect(
      sendRefundEmail({
        to: 'buyer@example.com',
        orderId: 'ORDER_X',
        refundedCents: 500,
        totalCents: 2599,
        shopUrl: 'https://dev.animeniacs.shop'
      })
    ).resolves.toBeUndefined()
    expect(mockSend).not.toHaveBeenCalled()
  })
})
