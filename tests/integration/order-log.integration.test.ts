import { db } from '@/lib/db/client'
import { appendOrderLog, hasEventId } from '@/lib/db/queries/order-log'
import { orderLog } from '@/lib/db/schema'
import { desc, eq, sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupByPrefix, testNamespace } from '../helpers/db'

const NS = testNamespace('order-log')

describe('order_log integration', () => {
  it('logs a webhook event', async () => {
    const squareOrderId = `${NS}_sq_order_1`
    const [row] = await db
      .insert(orderLog)
      .values({
        squareOrderId,
        eventType: 'order.created',
        payload: { merchant_id: 'm_xyz', type: 'order.created', data: { id: squareOrderId } }
      })
      .returning()
    expect(row.id).toBeGreaterThan(0)
    expect(row.eventType).toBe('order.created')
    expect(row.receivedAt).toBeInstanceOf(Date)
  })

  it('orders events for a single order chronologically', async () => {
    const squareOrderId = `${NS}_sq_order_2`
    await db.insert(orderLog).values({
      squareOrderId,
      eventType: 'order.created',
      payload: { seq: 1 }
    })
    // Small delay to ensure deterministic ordering by received_at.
    await new Promise((resolve) => setTimeout(resolve, 10))
    await db.insert(orderLog).values({
      squareOrderId,
      eventType: 'payment.created',
      payload: { seq: 2 }
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    await db.insert(orderLog).values({
      squareOrderId,
      eventType: 'order.fulfillment.updated',
      payload: { seq: 3 }
    })

    const rows = await db
      .select()
      .from(orderLog)
      .where(eq(orderLog.squareOrderId, squareOrderId))
      .orderBy(desc(orderLog.receivedAt))
    expect(rows.map((r) => r.eventType)).toEqual([
      'order.fulfillment.updated',
      'payment.created',
      'order.created'
    ])
  })

  it('accepts unknown event_type values (no enum constraint)', async () => {
    const squareOrderId = `${NS}_sq_order_3`
    // Square may add new event types over time; we should not reject them.
    const [row] = await db
      .insert(orderLog)
      .values({
        squareOrderId,
        eventType: 'order.future.unknown_event_type',
        payload: {}
      })
      .returning()
    expect(row.eventType).toBe('order.future.unknown_event_type')
  })

  afterAll(async () => {
    await cleanupByPrefix(orderLog, 'square_order_id', NS)
  })
})

const NS_HELPERS = testNamespace('orderlog')

afterAll(async () => {
  await db.delete(orderLog).where(sql`${orderLog.squareOrderId} LIKE ${`${NS_HELPERS}%`}`)
})

describe('order_log query helpers', () => {
  it('appendOrderLog inserts a row and returns it', async () => {
    const row = await appendOrderLog({
      squareOrderId: `${NS_HELPERS}_order_1`,
      eventType: 'payment.created',
      eventId: `${NS_HELPERS}_event_1`,
      payload: { foo: 'bar' }
    })
    expect(row.squareOrderId).toBe(`${NS_HELPERS}_order_1`)
    expect(row.eventType).toBe('payment.created')
    expect(row.eventId).toBe(`${NS_HELPERS}_event_1`)
    expect(row.receivedAt).toBeInstanceOf(Date)
  })

  it('hasEventId returns true after appendOrderLog with the same id', async () => {
    await appendOrderLog({
      squareOrderId: `${NS_HELPERS}_order_2`,
      eventType: 'payment.created',
      eventId: `${NS_HELPERS}_event_2`,
      payload: {}
    })
    expect(await hasEventId(`${NS_HELPERS}_event_2`)).toBe(true)
  })

  it('hasEventId returns false for unknown id', async () => {
    expect(await hasEventId(`${NS_HELPERS}_event_unknown`)).toBe(false)
  })

  it('hasEventId distinguishes empty string from null', async () => {
    // Null eventIds (e.g. non-webhook log writes) should never match a lookup.
    await appendOrderLog({
      squareOrderId: `${NS_HELPERS}_order_null`,
      eventType: 'manual',
      eventId: null,
      payload: {}
    })
    expect(await hasEventId('')).toBe(false)
  })
})
