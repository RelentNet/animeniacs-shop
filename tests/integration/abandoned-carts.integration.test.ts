import { db } from '@/lib/db/client'
import {
  createPendingCart,
  getCartBySquareOrderId,
  markCartAbandoned,
  markCartCompleted
} from '@/lib/db/queries/abandoned-carts'
import { abandonedCarts } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupByPrefix, testNamespace } from '../helpers/db'

const NS = testNamespace('abandoned-carts')

describe('abandoned_carts integration', () => {
  it('inserts a pending cart with defaults', async () => {
    const cartId = `${NS}_cart_1`
    const [row] = await db
      .insert(abandonedCarts)
      .values({
        cartId,
        cartSnapshot: { items: [{ id: 'sq_item_1', name: 'Naruto', qty: 1, price: 7500 }] }
      })
      .returning()
    expect(row.cartId).toBe(cartId)
    expect(row.status).toBe('pending') // default
    expect(row.squareOrderId).toBeNull()
    expect(row.reminderSentAt).toBeNull()
    expect(row.cartSnapshot).toEqual({
      items: [{ id: 'sq_item_1', name: 'Naruto', qty: 1, price: 7500 }]
    })
  })

  it('transitions through statuses', async () => {
    const cartId = `${NS}_cart_2`
    await db.insert(abandonedCarts).values({
      cartId,
      cartSnapshot: { items: [] }
    })

    for (const status of ['in_checkout', 'completed'] as const) {
      await db
        .update(abandonedCarts)
        .set({ status, updatedAt: new Date() })
        .where(eq(abandonedCarts.cartId, cartId))
      const [row] = await db.select().from(abandonedCarts).where(eq(abandonedCarts.cartId, cartId))
      expect(row.status).toBe(status)
    }
  })

  it('rejects an unknown status', async () => {
    const cartId = `${NS}_cart_3`
    await expect(
      db.insert(abandonedCarts).values({
        cartId,
        cartSnapshot: {},
        status: 'definitely_not_a_status' as never
      })
    ).rejects.toThrow()
  })

  afterAll(async () => {
    await cleanupByPrefix(abandonedCarts, 'cart_id', NS)
  })
})

const NS_HELPERS = testNamespace('abancarts')

function fixture(suffix: string, overrides: Record<string, unknown> = {}) {
  return {
    cartId: `${NS_HELPERS}_cart_${suffix}`,
    squareOrderId: `${NS_HELPERS}_order_${suffix}`,
    cartSnapshot: { items: [{ catalogItemId: 'A', variationId: 'V', quantity: 1 }] },
    buyerEmail: null,
    ...overrides
  }
}

afterAll(async () => {
  await db.delete(abandonedCarts).where(sql`${abandonedCarts.cartId} LIKE ${`${NS_HELPERS}%`}`)
})

describe('abandoned_carts query helpers', () => {
  it('createPendingCart inserts a row with status=pending', async () => {
    const row = await createPendingCart(fixture('create'))
    expect(row.cartId).toBe(`${NS_HELPERS}_cart_create`)
    expect(row.status).toBe('pending')
    expect(row.createdAt).toBeInstanceOf(Date)
  })

  it('getCartBySquareOrderId returns the row', async () => {
    await createPendingCart(fixture('lookup'))
    const found = await getCartBySquareOrderId(`${NS_HELPERS}_order_lookup`)
    expect(found?.cartId).toBe(`${NS_HELPERS}_cart_lookup`)
  })

  it('getCartBySquareOrderId returns undefined when missing', async () => {
    expect(await getCartBySquareOrderId(`${NS_HELPERS}_order_missing`)).toBeUndefined()
  })

  it('markCartCompleted flips status from pending', async () => {
    await createPendingCart(fixture('complete'))
    await markCartCompleted(`${NS_HELPERS}_order_complete`)
    const row = await getCartBySquareOrderId(`${NS_HELPERS}_order_complete`)
    expect(row?.status).toBe('completed')
  })

  it('markCartCompleted is idempotent', async () => {
    await createPendingCart(fixture('idempotent'))
    await markCartCompleted(`${NS_HELPERS}_order_idempotent`)
    await markCartCompleted(`${NS_HELPERS}_order_idempotent`)
    const row = await getCartBySquareOrderId(`${NS_HELPERS}_order_idempotent`)
    expect(row?.status).toBe('completed')
  })

  it('markCartCompleted on missing row does not throw', async () => {
    await expect(markCartCompleted(`${NS_HELPERS}_order_nope`)).resolves.not.toThrow()
  })

  it('markCartAbandoned flips status to abandoned', async () => {
    await createPendingCart(fixture('abandoned'))
    await markCartAbandoned(`${NS_HELPERS}_order_abandoned`)
    const row = await getCartBySquareOrderId(`${NS_HELPERS}_order_abandoned`)
    expect(row?.status).toBe('abandoned')
  })

  it('updatedAt bumps on status change', async () => {
    await createPendingCart(fixture('updated'))
    const before = await getCartBySquareOrderId(`${NS_HELPERS}_order_updated`)
    await new Promise((r) => setTimeout(r, 10))
    await markCartCompleted(`${NS_HELPERS}_order_updated`)
    const after = await getCartBySquareOrderId(`${NS_HELPERS}_order_updated`)
    expect(after?.updatedAt.getTime()).toBeGreaterThan(before?.updatedAt.getTime() ?? 0)
  })
})
