import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRefundPayment = vi.fn()
const mockGetSquareClient = vi.fn(() => ({
  refunds: { refundPayment: mockRefundPayment }
}))

vi.mock('@/lib/square/client', () => ({ getSquareClient: mockGetSquareClient }))

function order(over: Record<string, unknown> = {}) {
  return {
    id: 'oid',
    squareOrderId: 'sq-1',
    squarePaymentId: 'pay-1',
    status: 'completed' as const,
    totalCents: 2599,
    refundedCents: 0,
    currency: 'USD',
    ...over
  }
}

beforeEach(() => {
  mockRefundPayment.mockReset()
})

describe('issueFullRefund', () => {
  it('refunds the full remaining amount with the pinned SDK v44 shape', async () => {
    mockRefundPayment.mockResolvedValue({ refund: { id: 'ref-1', status: 'PENDING' } })
    const { issueFullRefund } = await import('@/lib/square/refunds')

    // biome-ignore lint/suspicious/noExplicitAny: test order fixture
    const result = await issueFullRefund({ order: order() as any, reason: 'Damaged' })

    expect(result).toEqual({ refundId: 'ref-1', status: 'PENDING' })
    expect(mockRefundPayment).toHaveBeenCalledWith({
      idempotencyKey: 'refund_sq-1',
      paymentId: 'pay-1',
      amountMoney: { amount: 2599n, currency: 'USD' },
      reason: 'Damaged'
    })
  })

  it('rejects when squarePaymentId is null, without calling Square', async () => {
    const { issueFullRefund } = await import('@/lib/square/refunds')
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: test order fixture
      issueFullRefund({ order: order({ squarePaymentId: null }) as any, reason: 'x' })
    ).rejects.toThrow(/payment/i)
    expect(mockRefundPayment).not.toHaveBeenCalled()
  })

  it('rejects when status is not completed, without calling Square', async () => {
    const { issueFullRefund } = await import('@/lib/square/refunds')
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: test order fixture
      issueFullRefund({ order: order({ status: 'refunded' }) as any, reason: 'x' })
    ).rejects.toThrow(/completed/i)
    expect(mockRefundPayment).not.toHaveBeenCalled()
  })

  it('rejects when already refunded (refundedCents > 0), without calling Square', async () => {
    const { issueFullRefund } = await import('@/lib/square/refunds')
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: test order fixture
      issueFullRefund({ order: order({ refundedCents: 100 }) as any, reason: 'x' })
    ).rejects.toThrow(/refund/i)
    expect(mockRefundPayment).not.toHaveBeenCalled()
  })

  it('rejects when remaining is not positive (zero total), without calling Square', async () => {
    const { issueFullRefund } = await import('@/lib/square/refunds')
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: test order fixture
      issueFullRefund({ order: order({ totalCents: 0 }) as any, reason: 'x' })
    ).rejects.toThrow()
    expect(mockRefundPayment).not.toHaveBeenCalled()
  })

  it('propagates a Square error (e.g. balance/too-old)', async () => {
    mockRefundPayment.mockRejectedValue(new Error('INSUFFICIENT_BALANCE'))
    const { issueFullRefund } = await import('@/lib/square/refunds')
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: test order fixture
      issueFullRefund({ order: order() as any, reason: 'x' })
    ).rejects.toThrow(/INSUFFICIENT_BALANCE/)
  })

  it('throws when Square returns no refund object', async () => {
    mockRefundPayment.mockResolvedValue({})
    const { issueFullRefund } = await import('@/lib/square/refunds')
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: test order fixture
      issueFullRefund({ order: order() as any, reason: 'x' })
    ).rejects.toThrow()
  })
})
