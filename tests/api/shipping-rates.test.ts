import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockValidate, mockQuoteRates, mockGetSettings } = vi.hoisted(() => ({
  mockValidate: vi.fn(),
  mockQuoteRates: vi.fn(),
  mockGetSettings: vi.fn()
}))

vi.mock('@/lib/checkout/validate-cart', () => ({ validateCart: mockValidate }))
vi.mock('@/lib/shipping/quote', () => ({ quoteRates: mockQuoteRates }))
vi.mock('@/lib/db/queries/shipping-settings', async (orig) => {
  const actual = await orig<typeof import('@/lib/db/queries/shipping-settings')>()
  return { ...actual, getShippingSettings: mockGetSettings }
})

import { DEFAULT_SHIPPING_SETTINGS } from '@/lib/db/queries/shipping-settings'

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
  mockGetSettings.mockResolvedValue(DEFAULT_SHIPPING_SETTINGS)
})
afterEach(() => {
  mockValidate.mockReset()
  mockQuoteRates.mockReset()
  mockGetSettings.mockReset()
})

describe('POST /api/shipping/rates', () => {
  it('returns live rate options for a shippable address', async () => {
    mockQuoteRates.mockResolvedValue({
      kind: 'rates',
      options: [
        {
          rateId: 'r1',
          shipmentId: 's1',
          carrier: 'USPS',
          service: 'Ground',
          amountCents: 800,
          estimatedDays: 4
        }
      ]
    })
    const { POST } = await import('@/app/api/shipping/rates/route')
    const res = await POST(makeRequest({ items: ITEMS, shippingAddress: ADDRESS }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.kind).toBe('rates')
    expect(json.options[0].rateId).toBe('r1')
    expect(mockQuoteRates).toHaveBeenCalledWith(
      expect.objectContaining({ country: 'US' }),
      [],
      'US'
    )
  })

  it.each(['JP', 'GB', 'DE'])(
    'rejects %s with 422 country_not_shippable by default (no rating)',
    async (country) => {
      const { POST } = await import('@/app/api/shipping/rates/route')
      const res = await POST(
        makeRequest({ items: ITEMS, shippingAddress: { ...ADDRESS, country, state: '' } })
      )
      expect(res.status).toBe(422)
      expect((await res.json()).error).toBe('country_not_shippable')
      expect(mockQuoteRates).not.toHaveBeenCalled()
    }
  )

  it('accepts GB once the admin enables it', async () => {
    mockGetSettings.mockResolvedValue({
      ...DEFAULT_SHIPPING_SETTINGS,
      countries: {
        ...DEFAULT_SHIPPING_SETTINGS.countries,
        GB: { enabled: true, decalFlatCents: null, noLiveRate: 'block', noLiveRateFlatCents: null }
      }
    })
    mockQuoteRates.mockResolvedValue({ kind: 'rates', options: [] })
    const { POST } = await import('@/app/api/shipping/rates/route')
    const res = await POST(
      makeRequest({ items: ITEMS, shippingAddress: { ...ADDRESS, country: 'GB', state: '' } })
    )
    expect(res.status).toBe(200)
    expect(mockQuoteRates).toHaveBeenCalledWith(expect.anything(), [], 'GB')
  })

  it('passes a blocked quote (Canada, no live rate) through to the form', async () => {
    mockQuoteRates.mockResolvedValue({ kind: 'blocked', reason: 'no_live_rate' })
    const { POST } = await import('@/app/api/shipping/rates/route')
    const res = await POST(
      makeRequest({
        items: ITEMS,
        shippingAddress: { ...ADDRESS, state: 'ON', zip: 'M5V 2T6', country: 'CA' }
      })
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ kind: 'blocked', reason: 'no_live_rate' })
  })

  it('rates Puerto Rico as US + state PR, keeping PR as the policy country', async () => {
    mockQuoteRates.mockResolvedValue({ kind: 'rates', options: [] })
    const { POST } = await import('@/app/api/shipping/rates/route')
    const res = await POST(
      makeRequest({
        items: ITEMS,
        shippingAddress: { ...ADDRESS, city: 'San Juan', state: '', zip: '00901', country: 'PR' }
      })
    )
    expect(res.status).toBe(200)
    expect(mockQuoteRates).toHaveBeenCalledWith(
      expect.objectContaining({ country: 'US', state: 'PR' }),
      [],
      'PR'
    )
  })

  it('returns 409 when prices have drifted', async () => {
    mockValidate.mockResolvedValue({
      ok: false,
      mismatches: [{ catalogItemId: 'A', variationId: 'V', expected: 2500, actual: 3000 }]
    })
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
