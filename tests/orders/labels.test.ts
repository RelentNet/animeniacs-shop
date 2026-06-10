import { fulfillmentLabel, statusLabel } from '@/lib/orders/labels'
import { describe, expect, it } from 'vitest'

describe('statusLabel', () => {
  it('maps known order statuses to friendly strings', () => {
    expect(statusLabel('completed')).toBe('Completed')
    expect(statusLabel('refunded')).toBe('Refunded')
    expect(statusLabel('partially_refunded')).toBe('Partially refunded')
  })

  it('falls back to a safe default for unknown statuses', () => {
    expect(statusLabel('something_new' as never)).toBe('Completed')
  })
})

describe('fulfillmentLabel', () => {
  it('maps Square fulfillment states to customer-friendly strings', () => {
    expect(fulfillmentLabel('PROPOSED')).toBe('Processing')
    expect(fulfillmentLabel('RESERVED')).toBe('Processing')
    expect(fulfillmentLabel('PREPARED')).toBe('Being prepared')
    expect(fulfillmentLabel('COMPLETED')).toBe('Shipped')
    expect(fulfillmentLabel('CANCELED')).toBe('Canceled')
    expect(fulfillmentLabel('FAILED')).toBe('Could not be fulfilled')
  })

  it('returns "Processing" when the state is null', () => {
    expect(fulfillmentLabel(null)).toBe('Processing')
  })

  it('falls back to "Processing" for an unknown state', () => {
    expect(fulfillmentLabel('WEIRD_STATE')).toBe('Processing')
  })
})
