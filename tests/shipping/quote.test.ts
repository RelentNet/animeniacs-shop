import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ValidatedLine } from '@/lib/checkout/validate-cart'

const { mockGetCategoryNameMap, mockCreateShipment, mockGetRate, mockGetSettings } = vi.hoisted(
  () => ({
    mockGetCategoryNameMap: vi.fn(),
    mockCreateShipment: vi.fn(),
    mockGetRate: vi.fn(),
    mockGetSettings: vi.fn()
  })
)

vi.mock('@/lib/square/categories', () => ({ getCategoryNameMap: mockGetCategoryNameMap }))
vi.mock('@/lib/shipping/shippo', () => ({
  createShipment: mockCreateShipment,
  getRate: mockGetRate
}))
vi.mock('@/lib/db/queries/shipping-settings', () => ({
  getShippingSettings: mockGetSettings
}))

import { priceShipping, quoteRates } from '@/lib/shipping/quote'

const ADDRESS = {
  name: 'B',
  street1: '1 St',
  city: 'LA',
  state: 'CA',
  zip: '90012',
  country: 'US'
}

const SETTINGS = {
  shipFrom: { name: 'A', street1: '2 St', street2: '', city: 'ATL', state: 'GA', zip: '30303', country: 'US', phone: '', email: '' },
  decalFlatCents: 500,
  fallbackFlatCents: 1000,
  markupPercent: 0
}

function line(overrides: Partial<ValidatedLine>): ValidatedLine {
  return {
    catalogItemId: 'item',
    variationId: 'v',
    quantity: 1,
    unitPriceCents: 5000,
    name: 'Art',
    variationName: 'Acrylic Wall Art',
    categoryIds: ['cat-acr'],
    ...overrides
  }
}

function rate(id: string, amount: string, provider = 'USPS', service = 'Ground') {
  return {
    rateId: id,
    shipmentId: 'shp_1',
    amountCents: Math.round(Number.parseFloat(amount) * 100),
    currency: 'USD',
    carrier: provider,
    service,
    serviceToken: 'tok',
    estimatedDays: 4
  }
}

beforeEach(() => {
  mockGetCategoryNameMap.mockReset()
  mockCreateShipment.mockReset()
  mockGetRate.mockReset()
  mockGetSettings.mockReset()
  mockGetSettings.mockResolvedValue(SETTINGS)
  mockGetCategoryNameMap.mockResolvedValue(
    new Map([
      ['cat-acr', 'Acrylic Wall Art'],
      ['cat-litbox', 'Lit Box Frame'],
      ['cat-slaps', 'Slaps']
    ])
  )
})

describe('quoteRates', () => {
  it('returns sorted live rate options for an acrylic cart', async () => {
    mockCreateShipment.mockResolvedValue({
      shipmentId: 'shp_1',
      rates: [rate('r_hi', '18.00'), rate('r_lo', '8.00')],
      messages: []
    })
    const result = await quoteRates(ADDRESS, [line({ quantity: 2 })])
    expect(result.kind).toBe('rates')
    if (result.kind !== 'rates') return
    expect(result.options.map((o) => o.amountCents)).toEqual([800, 1800])
    // packed 2 acrylics → 2 single_acrylic parcels passed to Shippo
    expect(mockCreateShipment.mock.calls[0][0].parcels).toHaveLength(2)
  })

  it('decals-only cart → flat decal fee, no live rating', async () => {
    const result = await quoteRates(ADDRESS, [line({ variationName: 'Vinyl Decal Prints', categoryIds: ['cat-acr'] })])
    expect(result).toEqual({ kind: 'flat', amountCents: 500, reason: 'decals_only' })
    expect(mockCreateShipment).not.toHaveBeenCalled()
  })

  it('adds the flat decal fee to each live rate for a mixed cart', async () => {
    mockCreateShipment.mockResolvedValue({ shipmentId: 'shp_1', rates: [rate('r', '8.00')], messages: [] })
    const result = await quoteRates(ADDRESS, [
      line({ quantity: 1 }), // acrylic
      line({ variationName: 'Vinyl Decal Prints' }) // decal → +500
    ])
    expect(result.kind).toBe('rates')
    if (result.kind !== 'rates') return
    expect(result.options[0].amountCents).toBe(800 + 500)
  })

  it('applies the percentage markup', async () => {
    mockGetSettings.mockResolvedValue({ ...SETTINGS, markupPercent: 10 })
    mockCreateShipment.mockResolvedValue({ shipmentId: 'shp_1', rates: [rate('r', '10.00')], messages: [] })
    const result = await quoteRates(ADDRESS, [line({})])
    if (result.kind !== 'rates') throw new Error('expected rates')
    expect(result.options[0].amountCents).toBe(1100)
  })

  it('falls back to the flat fee when Shippo throws', async () => {
    mockCreateShipment.mockRejectedValue(new Error('network'))
    const result = await quoteRates(ADDRESS, [line({})])
    expect(result).toEqual({ kind: 'flat', amountCents: 1000, reason: 'fallback' })
  })

  it('falls back to the flat fee when no rates are returned', async () => {
    mockCreateShipment.mockResolvedValue({ shipmentId: 'shp_1', rates: [], messages: ['no service'] })
    const result = await quoteRates(ADDRESS, [line({})])
    expect(result).toEqual({ kind: 'flat', amountCents: 1000, reason: 'fallback' })
  })
})

describe('priceShipping', () => {
  it('re-prices the chosen rate server-side (markup + decal) and returns the selection', async () => {
    mockGetSettings.mockResolvedValue({ ...SETTINGS, markupPercent: 10 })
    mockGetRate.mockResolvedValue(rate('r_sel', '20.00', 'DHL Express', 'Worldwide'))
    const result = await priceShipping([line({}), line({ variationName: 'Vinyl Decal Prints' })], 'r_sel')
    expect(result.fallbackUsed).toBe(false)
    expect(result.amountCents).toBe(Math.round(2000 * 1.1) + 500) // 2200 + 500
    expect(result.selection).toMatchObject({ rateId: 'r_sel', carrier: 'DHL Express', service: 'Worldwide', amountCents: result.amountCents })
  })

  it('flat-only cart needs no rate selection', async () => {
    const result = await priceShipping([line({ variationName: 'Vinyl Decal Prints' })], null)
    expect(result).toEqual({ amountCents: 500, selection: null, fallbackUsed: false })
    expect(mockGetRate).not.toHaveBeenCalled()
  })

  it('falls back to the flat fee when the selected rate is missing/expired', async () => {
    mockGetRate.mockResolvedValue(null)
    const result = await priceShipping([line({})], 'r_gone')
    expect(result).toEqual({ amountCents: 1000, selection: null, fallbackUsed: true })
  })
})
