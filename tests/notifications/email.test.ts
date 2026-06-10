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
