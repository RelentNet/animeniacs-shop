import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockValidate, mockQuoteRates } = vi.hoisted(() => ({
  mockValidate: vi.fn(),
  mockQuoteRates: vi.fn()
}))

vi.mock('@/lib/checkout/validate-cart', () => ({ validateCart: mockValidate }))
vi.mock('@/lib/shipping/quote', () => ({ quoteRates: mockQuoteRates }))

const ADDRESS = {
  firstName: 'B',
  lastName: 'One',
  line1: '1 St',
  city: 'LA',
  state: 'CA',
  zip: '90012',
  country: 'US'
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/shipping/rates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  })
}

const ITEMS = [{ catalogItemId: 'A', variationId: 'V', quantity: 1, expectedUnitPriceCents: 2500 }]

beforeEach(() => {
  mockValidate.mockResolvedValue({ ok: true, lines: [] })
})
afterEach(() => {
  mockValidate.mockReset()
  mockQuoteRates.mockReset()
})

describe('POST /api/shipping/rates', () => {
  it('returns live rate options for a shippable address', async () => {
    mockQuoteRates.mockResolvedValue({
      kind: 'rates',
      options: [{ rateId: 'r1', shipmentId: 's1', carrier: 'USPS', service: 'Ground', amountCents: 800, estimatedDays: 4 }]
    })
    const { POST } = await import('@/app/api/shipping/rates/route')
    const res = await POST(makeRequest({ items: ITEMS, shippingAddress: ADDRESS }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.kind).toBe('rates')
    expect(json.options[0].rateId).toBe('r1')
  })

  it('rejects an un-shippable country with 422 (no rating)', async () => {
    const { POST } = await import('@/app/api/shipping/rates/route')
    const res = await POST(makeRequest({ items: ITEMS, shippingAddress: { ...ADDRESS, country: 'JP', state: '' } }))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toBe('country_not_shippable')
    expect(mockQuoteRates).not.toHaveBeenCalled()
  })

  it('returns 409 when prices have drifted', async () => {
    mockValidate.mockResolvedValue({ ok: false, mismatches: [{ catalogItemId: 'A', variationId: 'V', expected: 2500, actual: 3000 }] })
    const { POST } = await import('@/app/api/shipping/rates/route')
    const res = await POST(makeRequest({ items: ITEMS, shippingAddress: ADDRESS }))
    expect(res.status).toBe(409)
    expect(mockQuoteRates).not.toHaveBeenCalled()
  })

  it('returns 400 when the address is missing', async () => {
    const { POST } = await import('@/app/api/shipping/rates/route')
    const res = await POST(makeRequest({ items: ITEMS }))
    expect(res.status).toBe(400)
  })
})
