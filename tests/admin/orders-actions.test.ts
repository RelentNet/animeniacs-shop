import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetCurrentUser = vi.fn()
const mockGetOrderById = vi.fn()
const mockUpdateOrderStatus = vi.fn()
const mockSetFulfillmentState = vi.fn()
const mockIssueFullRefund = vi.fn()
const mockAdvanceFulfillment = vi.fn()
const mockReconcileRefund = vi.fn()
const mockReconcileFulfillment = vi.fn()
const mockAppendOrderLog = vi.fn()
const mockRevalidatePath = vi.fn()

vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock('@/lib/db/queries/orders', () => ({
  getOrderById: mockGetOrderById,
  updateOrderStatus: mockUpdateOrderStatus,
  setOrderFulfillmentState: mockSetFulfillmentState
}))
vi.mock('@/lib/square/refunds', () => ({ issueFullRefund: mockIssueFullRefund }))
vi.mock('@/lib/square/fulfillment', async (importOriginal) => {
  const mod: typeof import('@/lib/square/fulfillment') = await importOriginal()
  return { ...mod, advanceFulfillment: mockAdvanceFulfillment }
})
vi.mock('@/lib/webhooks/reconcile', () => ({
  reconcileRefundFromSquare: mockReconcileRefund,
  reconcileFulfillmentFromSquare: mockReconcileFulfillment
}))
vi.mock('@/lib/db/queries/order-log', () => ({ appendOrderLog: mockAppendOrderLog }))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))

const ADMIN = {
  isAuthenticated: true,
  userId: 'admin-1',
  email: 'admin@example.com',
  name: 'Admin',
  roles: ['admin']
}
const NON_ADMIN = { ...ADMIN, roles: [] }

function order(over: Record<string, unknown> = {}) {
  return {
    id: 'oid',
    squareOrderId: 'sq-1',
    squarePaymentId: 'pay-1',
    status: 'completed',
    totalCents: 2599,
    refundedCents: 0,
    currency: 'USD',
    fulfillmentState: 'PROPOSED',
    ...over
  }
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

/** Read the error message off an action result regardless of the union branch. */
function errorOf(state: { ok: true } | { error: string } | undefined): string | undefined {
  return state && 'error' in state ? state.error : undefined
}

beforeEach(() => {
  mockGetCurrentUser.mockReset().mockResolvedValue(ADMIN)
  mockGetOrderById.mockReset().mockResolvedValue(order())
  mockUpdateOrderStatus.mockReset().mockResolvedValue(undefined)
  mockSetFulfillmentState.mockReset().mockResolvedValue(undefined)
  mockIssueFullRefund.mockReset().mockResolvedValue({ refundId: 'ref-1', status: 'PENDING' })
  mockAdvanceFulfillment
    .mockReset()
    .mockResolvedValue({ fromState: 'PROPOSED', toState: 'PREPARED' })
  mockReconcileRefund.mockReset().mockResolvedValue(undefined)
  mockReconcileFulfillment.mockReset().mockResolvedValue(undefined)
  mockAppendOrderLog.mockReset().mockResolvedValue(undefined)
  mockRevalidatePath.mockReset()
})

describe('issueRefundAction', () => {
  it('refunds on the happy path: calls Square, reconciles, audits, revalidates', async () => {
    const { issueRefundAction } = await import('@/app/(admin)/admin/orders/[id]/actions')
    const result = await issueRefundAction(
      'oid',
      undefined,
      form({ confirm: 'REFUND', reason: 'Damaged' })
    )

    expect(result).toEqual({ ok: true })
    expect(mockIssueFullRefund).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'Damaged', order: expect.objectContaining({ id: 'oid' }) })
    )
    // Optimistic reconcile via the shared webhook path (no forked math).
    expect(mockReconcileRefund).toHaveBeenCalledWith('sq-1')
    // Audit trail.
    expect(mockAppendOrderLog).toHaveBeenCalledWith(
      expect.objectContaining({
        squareOrderId: 'sq-1',
        eventType: 'admin.refund.issued',
        eventId: null,
        payload: expect.objectContaining({
          adminEmail: 'admin@example.com',
          amountCents: 2599,
          reason: 'Damaged',
          squareRefundId: 'ref-1'
        })
      })
    )
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/orders/oid')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/orders')
  })

  it('rejects a non-admin caller without calling Square', async () => {
    mockGetCurrentUser.mockResolvedValue(NON_ADMIN)
    const { issueRefundAction } = await import('@/app/(admin)/admin/orders/[id]/actions')
    const result = await issueRefundAction(
      'oid',
      undefined,
      form({ confirm: 'REFUND', reason: 'x' })
    )
    expect(errorOf(result)).toMatch(/admin|authoriz/i)
    expect(mockIssueFullRefund).not.toHaveBeenCalled()
  })

  it('rejects when the typed confirmation is wrong', async () => {
    const { issueRefundAction } = await import('@/app/(admin)/admin/orders/[id]/actions')
    const result = await issueRefundAction(
      'oid',
      undefined,
      form({ confirm: 'refund', reason: 'x' })
    )
    expect(errorOf(result)).toMatch(/confirm|REFUND/i)
    expect(mockIssueFullRefund).not.toHaveBeenCalled()
  })

  it('rejects when the reason is empty', async () => {
    const { issueRefundAction } = await import('@/app/(admin)/admin/orders/[id]/actions')
    const result = await issueRefundAction(
      'oid',
      undefined,
      form({ confirm: 'REFUND', reason: '   ' })
    )
    expect(errorOf(result)).toMatch(/reason/i)
    expect(mockIssueFullRefund).not.toHaveBeenCalled()
  })

  it('rejects when the order is missing', async () => {
    mockGetOrderById.mockResolvedValue(undefined)
    const { issueRefundAction } = await import('@/app/(admin)/admin/orders/[id]/actions')
    const result = await issueRefundAction(
      'oid',
      undefined,
      form({ confirm: 'REFUND', reason: 'x' })
    )
    expect(errorOf(result)).toMatch(/not found|order/i)
    expect(mockIssueFullRefund).not.toHaveBeenCalled()
  })

  it('rejects an already-refunded order before calling Square', async () => {
    mockGetOrderById.mockResolvedValue(order({ status: 'refunded', refundedCents: 2599 }))
    const { issueRefundAction } = await import('@/app/(admin)/admin/orders/[id]/actions')
    const result = await issueRefundAction(
      'oid',
      undefined,
      form({ confirm: 'REFUND', reason: 'x' })
    )
    expect(errorOf(result)).toBeTruthy()
    expect(mockIssueFullRefund).not.toHaveBeenCalled()
  })

  it('surfaces a Square error and does not audit/revalidate', async () => {
    mockIssueFullRefund.mockRejectedValue(new Error('INSUFFICIENT_BALANCE'))
    const { issueRefundAction } = await import('@/app/(admin)/admin/orders/[id]/actions')
    const result = await issueRefundAction(
      'oid',
      undefined,
      form({ confirm: 'REFUND', reason: 'x' })
    )
    expect(errorOf(result)).toMatch(/INSUFFICIENT_BALANCE/)
    expect(mockAppendOrderLog).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})

describe('advanceFulfillmentAction', () => {
  it('advances on the happy path: calls Square, reconciles, audits, revalidates', async () => {
    const { advanceFulfillmentAction } = await import('@/app/(admin)/admin/orders/[id]/actions')
    const result = await advanceFulfillmentAction('oid', undefined, form({ toState: 'PREPARED' }))

    expect(result).toEqual({ ok: true })
    expect(mockAdvanceFulfillment).toHaveBeenCalledWith({
      squareOrderId: 'sq-1',
      toState: 'PREPARED'
    })
    expect(mockReconcileFulfillment).toHaveBeenCalledWith('sq-1')
    expect(mockAppendOrderLog).toHaveBeenCalledWith(
      expect.objectContaining({
        squareOrderId: 'sq-1',
        eventType: 'admin.fulfillment.advanced',
        eventId: null,
        payload: expect.objectContaining({
          adminEmail: 'admin@example.com',
          fromState: 'PROPOSED',
          toState: 'PREPARED'
        })
      })
    )
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/orders/oid')
  })

  it('rejects a non-admin caller without calling Square', async () => {
    mockGetCurrentUser.mockResolvedValue(NON_ADMIN)
    const { advanceFulfillmentAction } = await import('@/app/(admin)/admin/orders/[id]/actions')
    const result = await advanceFulfillmentAction('oid', undefined, form({ toState: 'PREPARED' }))
    expect(errorOf(result)).toMatch(/admin|authoriz/i)
    expect(mockAdvanceFulfillment).not.toHaveBeenCalled()
  })

  it('rejects an invalid target state', async () => {
    const { advanceFulfillmentAction } = await import('@/app/(admin)/admin/orders/[id]/actions')
    const result = await advanceFulfillmentAction('oid', undefined, form({ toState: 'BOGUS' }))
    expect(errorOf(result)).toBeTruthy()
    expect(mockAdvanceFulfillment).not.toHaveBeenCalled()
  })

  it('surfaces the NO_FULFILLMENT error clearly', async () => {
    const { NoFulfillmentError } = await import('@/lib/square/fulfillment')
    mockAdvanceFulfillment.mockRejectedValue(new NoFulfillmentError())
    const { advanceFulfillmentAction } = await import('@/app/(admin)/admin/orders/[id]/actions')
    const result = await advanceFulfillmentAction('oid', undefined, form({ toState: 'PREPARED' }))
    expect(errorOf(result)).toMatch(/no fulfillment|square/i)
    expect(mockAppendOrderLog).not.toHaveBeenCalled()
  })

  it('surfaces a generic Square error', async () => {
    mockAdvanceFulfillment.mockRejectedValue(new Error('VERSION_MISMATCH'))
    const { advanceFulfillmentAction } = await import('@/app/(admin)/admin/orders/[id]/actions')
    const result = await advanceFulfillmentAction('oid', undefined, form({ toState: 'PREPARED' }))
    expect(errorOf(result)).toMatch(/VERSION_MISMATCH/)
  })
})
