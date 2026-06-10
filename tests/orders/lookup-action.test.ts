import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockLookup = vi.fn()

vi.mock('@/lib/db/queries/orders', () => ({ getOrderBySquareOrderIdAndEmail: mockLookup }))

beforeEach(() => {
  mockLookup.mockReset()
})

const order = {
  id: 'order-1',
  squareOrderId: 'sq-order-1',
  buyerEmail: 'buyer@example.com',
  status: 'completed',
  totalCents: 2599,
  lineItems: []
}

function makeForm(email: string, orderNumber: string) {
  const form = new FormData()
  form.set('email', email)
  form.set('orderNumber', orderNumber)
  return form
}

describe('lookupOrderAction', () => {
  it('returns the order on a match', async () => {
    mockLookup.mockResolvedValue(order)
    const { lookupOrderAction } = await import('@/app/orders/lookup/actions')
    const result = await lookupOrderAction({}, makeForm('buyer@example.com', 'sq-order-1'))
    expect(result.ok).toBe(true)
    expect(result.order).toBe(order)
    expect(result.error).toBeUndefined()
  })

  it('normalizes the email (trim + lowercase) and trims the order number before lookup', async () => {
    mockLookup.mockResolvedValue(order)
    const { lookupOrderAction } = await import('@/app/orders/lookup/actions')
    await lookupOrderAction({}, makeForm('  Buyer@Example.COM  ', '  sq-order-1  '))
    expect(mockLookup).toHaveBeenCalledWith('sq-order-1', 'buyer@example.com')
  })

  it('returns a generic error for a wrong email (no match)', async () => {
    mockLookup.mockResolvedValue(undefined)
    const { lookupOrderAction } = await import('@/app/orders/lookup/actions')
    const result = await lookupOrderAction({}, makeForm('wrong@example.com', 'sq-order-1'))
    expect(result.ok).toBeUndefined()
    expect(result.error).toBeTruthy()
  })

  it('returns a generic error for a wrong order number (no match)', async () => {
    mockLookup.mockResolvedValue(undefined)
    const { lookupOrderAction } = await import('@/app/orders/lookup/actions')
    const result = await lookupOrderAction({}, makeForm('buyer@example.com', 'wrong-number'))
    expect(result.ok).toBeUndefined()
    expect(result.error).toBeTruthy()
  })

  it('SECURITY: the wrong-email and wrong-number errors are identical (no field disclosure)', async () => {
    mockLookup.mockResolvedValue(undefined)
    const { lookupOrderAction } = await import('@/app/orders/lookup/actions')
    const wrongEmail = await lookupOrderAction({}, makeForm('wrong@example.com', 'sq-order-1'))
    const wrongNumber = await lookupOrderAction({}, makeForm('buyer@example.com', 'wrong-number'))
    expect(wrongEmail.error).toBe(wrongNumber.error)
  })

  it('returns a generic error without querying when a field is missing', async () => {
    const { lookupOrderAction } = await import('@/app/orders/lookup/actions')
    const missingEmail = await lookupOrderAction({}, makeForm('', 'sq-order-1'))
    const missingNumber = await lookupOrderAction({}, makeForm('buyer@example.com', ''))
    expect(missingEmail.error).toBeTruthy()
    expect(missingNumber.error).toBeTruthy()
    // Same generic message as a real mismatch (no "field required" disclosure).
    expect(missingEmail.error).toBe(missingNumber.error)
    expect(mockLookup).not.toHaveBeenCalled()
  })
})
