import { toJsonSafe } from '@/lib/orders/json-safe'
import { describe, expect, it } from 'vitest'

describe('toJsonSafe', () => {
  it('deep-converts bigint Money amounts to numbers so the value is JSON-serializable', () => {
    const order = {
      id: 'ORDER_X',
      totalMoney: { amount: BigInt(4500), currency: 'USD' },
      lineItems: [{ name: 'A', basePriceMoney: { amount: BigInt(2500) } }]
    }
    const safe = toJsonSafe(order)
    expect(safe.totalMoney.amount).toBe(4500)
    expect(safe.lineItems[0].basePriceMoney.amount).toBe(2500)
    // No bigints anywhere → serializable without throwing.
    expect(() => JSON.stringify(safe)).not.toThrow()
    expect(typeof safe.totalMoney.amount).toBe('number')
  })

  it('passes null and undefined through unchanged', () => {
    expect(toJsonSafe(null)).toBeNull()
    expect(toJsonSafe(undefined)).toBeUndefined()
  })

  it('preserves non-bigint scalars, arrays, and nested objects', () => {
    const value = { a: 'x', b: 1, c: true, d: [1, 2, { e: 'f' }] }
    expect(toJsonSafe(value)).toEqual(value)
  })
})
