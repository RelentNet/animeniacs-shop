import { beforeEach, describe, expect, it, vi } from 'vitest'

// Chainable db mock. `where` is the terminal awaited call in both queries
// under test, so each test sets its resolved value.
const mockDb = {
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  update: vi.fn(),
  set: vi.fn()
}

vi.mock('@/lib/db/client', () => ({ db: mockDb }))

beforeEach(() => {
  mockDb.select.mockReset().mockReturnThis()
  mockDb.from.mockReset().mockReturnThis()
  mockDb.where.mockReset().mockResolvedValue([])
  mockDb.update.mockReset().mockReturnThis()
  mockDb.set.mockReset().mockReturnThis()
})

describe('getCartsForReminder', () => {
  it('returns only pending carts with non-null email, past threshold, unsent reminder', async () => {
    const row = {
      cartId: 'cart-1',
      buyerEmail: 'buyer@example.com',
      cartSnapshot: { items: [{ catalogItemId: 'ITEM_A', quantity: 1 }] }
    }
    mockDb.where.mockResolvedValue([row])

    const { getCartsForReminder } = await import('@/lib/db/queries/abandoned-carts')
    const results = await getCartsForReminder(60)

    expect(results).toHaveLength(1)
    expect(results[0].cartId).toBe('cart-1')
    expect(results[0].buyerEmail).toBe('buyer@example.com')
  })
})

describe('markReminderSent', () => {
  it('updates reminderSentAt and status to abandoned', async () => {
    const { markReminderSent } = await import('@/lib/db/queries/abandoned-carts')
    await expect(markReminderSent('cart-1')).resolves.toBeUndefined()
    expect(mockDb.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'abandoned', reminderSentAt: expect.any(Date) })
    )
  })
})
