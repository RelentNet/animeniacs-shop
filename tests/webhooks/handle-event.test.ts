import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockAppendLog,
  mockHasEventId,
  mockMarkCompleted,
  mockGetCart,
  mockDiscord,
  mockSmsNotify,
  mockOrdersGet,
  mockUpsertOrder
} = vi.hoisted(() => ({
  mockAppendLog: vi.fn(),
  mockHasEventId: vi.fn(),
  mockMarkCompleted: vi.fn(),
  mockGetCart: vi.fn(),
  mockDiscord: vi.fn(),
  mockSmsNotify: vi.fn(),
  mockOrdersGet: vi.fn(),
  mockUpsertOrder: vi.fn()
}))

vi.mock('@/lib/db/queries/order-log', () => ({
  appendOrderLog: mockAppendLog,
  hasEventId: mockHasEventId
}))
vi.mock('@/lib/db/queries/abandoned-carts', () => ({
  markCartCompleted: mockMarkCompleted,
  getCartBySquareOrderId: mockGetCart
}))
vi.mock('@/lib/notifications/discord', () => ({
  sendDiscordOrderNotification: mockDiscord
}))
vi.mock('@/lib/notifications/sms', () => ({
  notifyEnabledRecipients: mockSmsNotify
}))
vi.mock('@/lib/square/client', () => ({
  getSquareClient: () => ({ orders: { get: mockOrdersGet } })
}))
vi.mock('@/lib/db/queries/orders', () => ({ upsertOrder: mockUpsertOrder }))

import { handleSquareEvent } from '@/lib/webhooks/handle-event'

beforeEach(() => {
  mockAppendLog.mockReset()
  mockHasEventId.mockReset().mockResolvedValue(false)
  mockMarkCompleted.mockReset()
  mockGetCart.mockReset()
  mockDiscord.mockReset()
  mockSmsNotify.mockReset()
  mockOrdersGet.mockReset().mockResolvedValue({
    order: {
      id: 'ORDER_X',
      totalMoney: { amount: BigInt(4500), currency: 'USD' },
      lineItems: [],
      createdAt: '2026-06-10T12:00:00Z'
    }
  })
  mockUpsertOrder.mockReset().mockResolvedValue(undefined)
})

function paymentEvent(over: Record<string, unknown> = {}) {
  return {
    event_id: 'EVT_1',
    type: 'payment.created',
    data: {
      object: {
        payment: {
          order_id: 'ORDER_X',
          total_money: { amount: 4500, currency: 'USD' },
          buyer_email_address: 'buyer@example.com'
        }
      }
    },
    ...over
  }
}

describe('handleSquareEvent', () => {
  it('appends to order_log for every event type', async () => {
    await handleSquareEvent({
      event: paymentEvent({ type: 'unknown.event' }),
      webhookUrl: 'x',
      signatureKey: 'k'
    })
    expect(mockAppendLog).toHaveBeenCalledTimes(1)
  })

  it('skips notifications when event_id was already processed', async () => {
    mockHasEventId.mockResolvedValue(true)
    await handleSquareEvent({ event: paymentEvent(), webhookUrl: 'x', signatureKey: 'k' })
    expect(mockAppendLog).toHaveBeenCalledTimes(1)
    expect(mockDiscord).not.toHaveBeenCalled()
    expect(mockSmsNotify).not.toHaveBeenCalled()
  })

  it('on payment.created: marks cart completed + fans out notifications', async () => {
    mockGetCart.mockResolvedValue({
      cartId: 'cart-uuid',
      squareOrderId: 'ORDER_X',
      cartSnapshot: { items: [{ catalogItemId: 'A', variationId: 'V', quantity: 2 }] },
      buyerEmail: null,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      reminderSentAt: null
    })
    process.env.DISCORD_ORDER_WEBHOOK_URL = 'https://discord.test/webhook'
    await handleSquareEvent({ event: paymentEvent(), webhookUrl: 'x', signatureKey: 'k' })
    expect(mockMarkCompleted).toHaveBeenCalledWith('ORDER_X')
    expect(mockDiscord).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ORDER_X',
        totalCents: 4500,
        itemCount: 2,
        buyerEmail: 'buyer@example.com'
      })
    )
    expect(mockSmsNotify).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'ORDER_X', totalCents: 4500, itemCount: 2 })
    )
  })

  it('payment.created without a known cart still fires notifications with itemCount=0', async () => {
    mockGetCart.mockResolvedValue(undefined)
    process.env.DISCORD_ORDER_WEBHOOK_URL = 'https://discord.test/webhook'
    await handleSquareEvent({ event: paymentEvent(), webhookUrl: 'x', signatureKey: 'k' })
    expect(mockDiscord).toHaveBeenCalledWith(expect.objectContaining({ itemCount: 0 }))
  })

  it('order.fulfillment.updated and refund.created are logged but do not fan out', async () => {
    await handleSquareEvent({
      event: { event_id: 'E', type: 'order.fulfillment.updated', data: { object: {} } },
      webhookUrl: 'x',
      signatureKey: 'k'
    })
    await handleSquareEvent({
      event: { event_id: 'E2', type: 'refund.created', data: { object: {} } },
      webhookUrl: 'x',
      signatureKey: 'k'
    })
    expect(mockAppendLog).toHaveBeenCalledTimes(2)
    expect(mockDiscord).not.toHaveBeenCalled()
    expect(mockSmsNotify).not.toHaveBeenCalled()
  })

  it('does not throw if downstream notification fails', async () => {
    mockGetCart.mockResolvedValue(undefined)
    mockDiscord.mockRejectedValue(new Error('discord down'))
    mockSmsNotify.mockRejectedValue(new Error('sms down'))
    process.env.DISCORD_ORDER_WEBHOOK_URL = 'https://discord.test/webhook'
    await expect(
      handleSquareEvent({ event: paymentEvent(), webhookUrl: 'x', signatureKey: 'k' })
    ).resolves.not.toThrow()
  })

  it('on payment.created: records the order with bridge identity', async () => {
    mockGetCart.mockResolvedValue({
      cartId: 'cart-uuid',
      squareOrderId: 'ORDER_X',
      cartSnapshot: { items: [] },
      buyerEmail: 'buyer@example.com',
      buyerUserId: 'user-123',
      squareCustomerId: 'sq_cust_1',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      reminderSentAt: null
    })
    await handleSquareEvent({ event: paymentEvent(), webhookUrl: 'x', signatureKey: 'k' })

    expect(mockOrdersGet).toHaveBeenCalledWith({ orderId: 'ORDER_X' })
    expect(mockUpsertOrder).toHaveBeenCalledTimes(1)
    expect(mockUpsertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        squareOrderId: 'ORDER_X',
        userId: 'user-123',
        buyerEmail: 'buyer@example.com',
        squareCustomerId: 'sq_cust_1',
        status: 'completed',
        totalCents: 4500
      })
    )
  })

  it('records a guest order (null userId) when there is no bridge cart', async () => {
    mockGetCart.mockResolvedValue(undefined)
    await handleSquareEvent({ event: paymentEvent(), webhookUrl: 'x', signatureKey: 'k' })
    expect(mockUpsertOrder).toHaveBeenCalledWith(
      expect.objectContaining({ squareOrderId: 'ORDER_X', userId: null })
    )
  })

  it('does NOT record an order for a duplicate (already-seen) event', async () => {
    mockHasEventId.mockResolvedValue(true)
    await handleSquareEvent({ event: paymentEvent(), webhookUrl: 'x', signatureKey: 'k' })
    expect(mockOrdersGet).not.toHaveBeenCalled()
    expect(mockUpsertOrder).not.toHaveBeenCalled()
  })

  it('does not throw if order recording fails (logs + continues)', async () => {
    mockGetCart.mockResolvedValue(undefined)
    mockOrdersGet.mockRejectedValue(new Error('square down'))
    await expect(
      handleSquareEvent({ event: paymentEvent(), webhookUrl: 'x', signatureKey: 'k' })
    ).resolves.not.toThrow()
    expect(mockUpsertOrder).not.toHaveBeenCalled()
  })
})
