import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockAppendLog,
  mockHasEventId,
  mockMarkCompleted,
  mockGetCart,
  mockDiscord,
  mockSmsNotify,
  mockOrdersGet,
  mockPaymentsGet,
  mockUpsertOrder,
  mockUpdateOrderStatus,
  mockSetFulfillmentState,
  mockUpdateOrderRaw,
  mockGetOrderBySquareOrderId,
  mockSendConfirmation,
  mockSendRefund
} = vi.hoisted(() => ({
  mockAppendLog: vi.fn(),
  mockHasEventId: vi.fn(),
  mockMarkCompleted: vi.fn(),
  mockGetCart: vi.fn(),
  mockDiscord: vi.fn(),
  mockSmsNotify: vi.fn(),
  mockOrdersGet: vi.fn(),
  mockPaymentsGet: vi.fn(),
  mockUpsertOrder: vi.fn(),
  mockUpdateOrderStatus: vi.fn(),
  mockSetFulfillmentState: vi.fn(),
  mockUpdateOrderRaw: vi.fn(),
  mockGetOrderBySquareOrderId: vi.fn(),
  mockSendConfirmation: vi.fn(),
  mockSendRefund: vi.fn()
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
  getSquareClient: () => ({
    orders: { get: mockOrdersGet },
    payments: { get: mockPaymentsGet }
  })
}))
vi.mock('@/lib/db/queries/orders', () => ({
  upsertOrder: mockUpsertOrder,
  updateOrderStatus: mockUpdateOrderStatus,
  setOrderFulfillmentState: mockSetFulfillmentState,
  updateOrderRaw: mockUpdateOrderRaw,
  getOrderBySquareOrderId: mockGetOrderBySquareOrderId
}))
vi.mock('@/lib/notifications/email', () => ({
  sendOrderConfirmationEmail: mockSendConfirmation,
  sendRefundEmail: mockSendRefund
}))

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
  // Refunds reconcile from the PAYMENT (refundedMoney + orderId), not the order.
  mockPaymentsGet.mockReset().mockResolvedValue({
    payment: { orderId: 'ORDER_X', refundedMoney: { amount: BigInt(500), currency: 'USD' } }
  })
  mockUpsertOrder.mockReset().mockResolvedValue(undefined)
  mockUpdateOrderStatus.mockReset().mockResolvedValue(undefined)
  mockSetFulfillmentState.mockReset().mockResolvedValue(undefined)
  mockUpdateOrderRaw.mockReset().mockResolvedValue(undefined)
  mockGetOrderBySquareOrderId.mockReset().mockResolvedValue({
    squareOrderId: 'ORDER_X',
    buyerEmail: 'buyer@example.com',
    totalCents: 4500
  })
  mockSendConfirmation.mockReset().mockResolvedValue(undefined)
  mockSendRefund.mockReset().mockResolvedValue(undefined)
})

function refundEvent(over: Record<string, unknown> = {}) {
  return {
    event_id: 'EVT_REFUND_1',
    type: 'refund.created',
    // Square books the refund onto a SEPARATE $0 "refund order" — refund.order_id
    // (REFUND_ORDER) is NOT the sale order. The handler must key off payment_id;
    // the payment resolves back to the sale order (ORDER_X).
    data: { object: { refund: { payment_id: 'PAY_X', order_id: 'REFUND_ORDER' } } },
    ...over
  }
}

function fulfillmentEvent(over: Record<string, unknown> = {}) {
  return {
    event_id: 'EVT_FULFILL_1',
    type: 'order.fulfillment.updated',
    data: { object: { order_fulfillment_updated: { order_id: 'ORDER_X' } } },
    ...over
  }
}

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

/** True if the value (deeply) contains a bigint anywhere — what would crash jsonb. */
function hasBigInt(value: unknown): boolean {
  if (typeof value === 'bigint') return true
  if (Array.isArray(value)) return value.some(hasBigInt)
  if (value && typeof value === 'object') return Object.values(value).some(hasBigInt)
  return false
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

  it('refund.created and order.fulfillment.updated do not trigger the order SMS fanout', async () => {
    await handleSquareEvent({ event: fulfillmentEvent(), webhookUrl: 'x', signatureKey: 'k' })
    await handleSquareEvent({ event: refundEvent(), webhookUrl: 'x', signatureKey: 'k' })
    expect(mockAppendLog).toHaveBeenCalledTimes(2)
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

  // --- Phase 13: order confirmation email on payment.created ---

  it('on payment.created with a buyer email: sends a confirmation email after recording', async () => {
    mockGetCart.mockResolvedValue(undefined)
    await handleSquareEvent({ event: paymentEvent(), webhookUrl: 'x', signatureKey: 'k' })
    expect(mockUpsertOrder).toHaveBeenCalledTimes(1)
    expect(mockSendConfirmation).toHaveBeenCalledTimes(1)
    expect(mockSendConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'buyer@example.com', orderId: 'ORDER_X', totalCents: 4500 })
    )
  })

  it('on payment.created without any buyer email: does not send a confirmation email', async () => {
    mockGetCart.mockResolvedValue(undefined)
    const noEmail = paymentEvent()
    noEmail.data.object.payment.buyer_email_address = undefined as unknown as string
    await handleSquareEvent({ event: noEmail, webhookUrl: 'x', signatureKey: 'k' })
    expect(mockSendConfirmation).not.toHaveBeenCalled()
  })

  it('a throwing confirmation email does not throw out of the webhook', async () => {
    mockGetCart.mockResolvedValue(undefined)
    mockSendConfirmation.mockRejectedValue(new Error('resend down'))
    await expect(
      handleSquareEvent({ event: paymentEvent(), webhookUrl: 'x', signatureKey: 'k' })
    ).resolves.not.toThrow()
  })

  // --- Phase 13: refund handling ---

  it('refund below the total → partially_refunded + refund email (keyed by payment, not refund.order_id)', async () => {
    // payment.refundedMoney=500, sale order total=4500 (default mockOrdersGet)
    mockPaymentsGet.mockResolvedValue({
      payment: { orderId: 'ORDER_X', refundedMoney: { amount: BigInt(500), currency: 'USD' } }
    })
    await handleSquareEvent({ event: refundEvent(), webhookUrl: 'x', signatureKey: 'k' })
    // Updates the SALE order (ORDER_X from payment.orderId), NOT refund.order_id (REFUND_ORDER).
    expect(mockUpdateOrderStatus).toHaveBeenCalledWith('ORDER_X', 'partially_refunded', 500)
    expect(mockSendRefund).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'buyer@example.com', orderId: 'ORDER_X', refundedCents: 500 })
    )
  })

  it('payment refundedMoney to/over the total → refunded', async () => {
    mockPaymentsGet.mockResolvedValue({
      payment: { orderId: 'ORDER_X', refundedMoney: { amount: BigInt(4500), currency: 'USD' } }
    })
    await handleSquareEvent({ event: refundEvent(), webhookUrl: 'x', signatureKey: 'k' })
    expect(mockUpdateOrderStatus).toHaveBeenCalledWith('ORDER_X', 'refunded', 4500)
  })

  it('refund with no known buyer email → status updates but no email', async () => {
    mockGetOrderBySquareOrderId.mockResolvedValue({
      squareOrderId: 'ORDER_X',
      buyerEmail: null,
      totalCents: 4500
    })
    await handleSquareEvent({ event: refundEvent(), webhookUrl: 'x', signatureKey: 'k' })
    expect(mockUpdateOrderStatus).toHaveBeenCalledWith('ORDER_X', 'partially_refunded', 500)
    expect(mockSendRefund).not.toHaveBeenCalled()
  })

  it('refund amount comes from the Square payment, not the webhook payload', async () => {
    // Payload claims a huge refund; the authoritative payment.refundedMoney says 500.
    mockPaymentsGet.mockResolvedValue({
      payment: { orderId: 'ORDER_X', refundedMoney: { amount: BigInt(500), currency: 'USD' } }
    })
    const evt = refundEvent({
      data: { object: { refund: { payment_id: 'PAY_X', order_id: 'REFUND_ORDER', amount_money: { amount: 999999 } } } }
    })
    await handleSquareEvent({ event: evt, webhookUrl: 'x', signatureKey: 'k' })
    expect(mockUpdateOrderStatus).toHaveBeenCalledWith('ORDER_X', 'partially_refunded', 500)
  })

  it('a refund with no resolvable payment id → no status update, no throw', async () => {
    const evt = refundEvent({ data: { object: { refund: { order_id: 'REFUND_ORDER' } } } })
    await expect(
      handleSquareEvent({ event: evt, webhookUrl: 'x', signatureKey: 'k' })
    ).resolves.not.toThrow()
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled()
  })

  it('a throwing refund email does not throw out of the webhook', async () => {
    mockSendRefund.mockRejectedValue(new Error('resend down'))
    await expect(
      handleSquareEvent({ event: refundEvent(), webhookUrl: 'x', signatureKey: 'k' })
    ).resolves.not.toThrow()
    expect(mockUpdateOrderStatus).toHaveBeenCalled()
  })

  it('does not process a refund for a duplicate (already-seen) event', async () => {
    mockHasEventId.mockResolvedValue(true)
    await handleSquareEvent({ event: refundEvent(), webhookUrl: 'x', signatureKey: 'k' })
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled()
    expect(mockSendRefund).not.toHaveBeenCalled()
  })

  // --- Phase 13: fulfillment handling ---

  it('order.fulfillment.updated → sets the most-advanced fulfillment state from the Square order', async () => {
    mockOrdersGet.mockResolvedValue({
      order: {
        id: 'ORDER_X',
        totalMoney: { amount: BigInt(4500), currency: 'USD' },
        fulfillments: [
          { uid: 'f1', state: 'PROPOSED' },
          { uid: 'f2', state: 'PREPARED' }
        ]
      }
    })
    await handleSquareEvent({ event: fulfillmentEvent(), webhookUrl: 'x', signatureKey: 'k' })
    expect(mockOrdersGet).toHaveBeenCalledWith({ orderId: 'ORDER_X' })
    expect(mockSetFulfillmentState).toHaveBeenCalledWith('ORDER_X', 'PREPARED')
  })

  it('a throwing fulfillment update does not throw out of the webhook', async () => {
    mockOrdersGet.mockRejectedValue(new Error('square down'))
    await expect(
      handleSquareEvent({ event: fulfillmentEvent(), webhookUrl: 'x', signatureKey: 'k' })
    ).resolves.not.toThrow()
    expect(mockSetFulfillmentState).not.toHaveBeenCalled()
  })

  // --- Phase 18: raw refresh on reconcile (keeps Square state + shipment fresh) ---

  it('order.fulfillment.updated refreshes the order raw snapshot (BigInt-safe)', async () => {
    mockOrdersGet.mockResolvedValue({
      order: {
        id: 'ORDER_X',
        state: 'COMPLETED',
        totalMoney: { amount: BigInt(4500), currency: 'USD' },
        fulfillments: [{ uid: 'f1', state: 'COMPLETED', type: 'SHIPMENT' }]
      }
    })
    await handleSquareEvent({ event: fulfillmentEvent(), webhookUrl: 'x', signatureKey: 'k' })
    expect(mockUpdateOrderRaw).toHaveBeenCalledTimes(1)
    const [orderId, raw] = mockUpdateOrderRaw.mock.calls[0]
    expect(orderId).toBe('ORDER_X')
    expect(raw).toEqual(expect.objectContaining({ id: 'ORDER_X', state: 'COMPLETED' }))
    // The raw bigint Money MUST be sanitized before persistence (Phase 17 crash).
    expect(hasBigInt(raw)).toBe(false)
    expect(raw.totalMoney.amount).toBe(4500)
  })

  it('refund.* refreshes the SALE order raw (resolved via payment), BigInt-safe', async () => {
    mockPaymentsGet.mockResolvedValue({
      payment: { orderId: 'ORDER_X', refundedMoney: { amount: BigInt(500), currency: 'USD' } }
    })
    mockOrdersGet.mockResolvedValue({
      order: {
        id: 'ORDER_X',
        state: 'OPEN',
        totalMoney: { amount: BigInt(4500), currency: 'USD' },
        lineItems: []
      }
    })
    await handleSquareEvent({ event: refundEvent(), webhookUrl: 'x', signatureKey: 'k' })
    expect(mockUpdateOrderRaw).toHaveBeenCalledTimes(1)
    const [orderId, raw] = mockUpdateOrderRaw.mock.calls[0]
    // The SALE order (ORDER_X from payment.orderId), NOT refund.order_id (REFUND_ORDER).
    expect(orderId).toBe('ORDER_X')
    expect(hasBigInt(raw)).toBe(false)
    expect(raw.totalMoney.amount).toBe(4500)
  })
})
