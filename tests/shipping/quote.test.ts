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

import { type PricedShipping, priceShipping, quoteRates } from '@/lib/shipping/quote'

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
  markupPercent: 0,
  packagingFeesCents: { single_acrylic: 0, frame: 0, '3_frames': 0 }
}

function quoteUS(lines: ValidatedLine[]) {
  return quoteRates(ADDRESS, lines, 'US')
}

async function priceUS(lines: ValidatedLine[], rateId: string | null): Promise<PricedShipping> {
  const result = await priceShipping(lines, rateId, 'US')
  if ('blocked' in result) throw new Error('unexpected block for US')
  return result
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
    const result = await quoteUS([line({ quantity: 2 })])
    expect(result.kind).toBe('rates')
    if (result.kind !== 'rates') return
    expect(result.options.map((o) => o.amountCents)).toEqual([800, 1800])
    // packed 2 acrylics → 2 single_acrylic parcels passed to Shippo
    expect(mockCreateShipment.mock.calls[0][0].parcels).toHaveLength(2)
  })

  it('decals-only cart → flat decal fee, no live rating', async () => {
    const result = await quoteUS([line({ variationName: 'Vinyl Decal Prints', categoryIds: ['cat-acr'] })])
    expect(result).toEqual({ kind: 'flat', amountCents: 500, reason: 'decals_only' })
    expect(mockCreateShipment).not.toHaveBeenCalled()
  })

  it('adds the flat decal fee to each live rate for a mixed cart', async () => {
    mockCreateShipment.mockResolvedValue({ shipmentId: 'shp_1', rates: [rate('r', '8.00')], messages: [] })
    const result = await quoteUS([
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
    const result = await quoteUS([line({})])
    if (result.kind !== 'rates') throw new Error('expected rates')
    expect(result.options[0].amountCents).toBe(1100)
  })

  it('adds the per-box packaging fee once per parcel', async () => {
    // $3/box packaging; 2 acrylics → 2 single_acrylic boxes → +$6 on each rate.
    mockGetSettings.mockResolvedValue({
      ...SETTINGS,
      packagingFeesCents: { single_acrylic: 300, frame: 0, '3_frames': 0 }
    })
    mockCreateShipment.mockResolvedValue({ shipmentId: 'shp_1', rates: [rate('r', '8.00')], messages: [] })
    const result = await quoteUS([line({ quantity: 2 })])
    if (result.kind !== 'rates') throw new Error('expected rates')
    expect(result.options[0].amountCents).toBe(800 + 600)
  })

  it('adds packaging + decal fee to the fallback flat fee', async () => {
    mockGetSettings.mockResolvedValue({
      ...SETTINGS,
      packagingFeesCents: { single_acrylic: 300, frame: 0, '3_frames': 0 }
    })
    mockCreateShipment.mockRejectedValue(new Error('network'))
    const result = await quoteUS([
      line({ quantity: 1 }), // acrylic → 1 box → +300 packaging
      line({ variationName: 'Vinyl Decal Prints' }) // decal → +500
    ])
    expect(result).toEqual({ kind: 'flat', amountCents: 1000 + 500 + 300, reason: 'fallback' })
  })

  it('falls back to the flat fee when Shippo throws', async () => {
    mockCreateShipment.mockRejectedValue(new Error('network'))
    const result = await quoteUS([line({})])
    expect(result).toEqual({ kind: 'flat', amountCents: 1000, reason: 'fallback' })
  })

  it('falls back to the flat fee when no rates are returned', async () => {
    mockCreateShipment.mockResolvedValue({ shipmentId: 'shp_1', rates: [], messages: ['no service'] })
    const result = await quoteUS([line({})])
    expect(result).toEqual({ kind: 'flat', amountCents: 1000, reason: 'fallback' })
  })
})

describe('priceShipping', () => {
  it('re-prices the chosen rate server-side (markup + decal) and returns the selection', async () => {
    mockGetSettings.mockResolvedValue({ ...SETTINGS, markupPercent: 10 })
    mockGetRate.mockResolvedValue(rate('r_sel', '20.00', 'DHL Express', 'Worldwide'))
    const result = await priceUS([line({}), line({ variationName: 'Vinyl Decal Prints' })], 'r_sel')
    expect(result.fallbackUsed).toBe(false)
    expect(result.amountCents).toBe(Math.round(2000 * 1.1) + 500) // 2200 + 500
    expect(result.selection).toMatchObject({ rateId: 'r_sel', carrier: 'DHL Express', service: 'Worldwide', amountCents: result.amountCents })
  })

  it('flat-only cart needs no rate selection', async () => {
    const result = await priceUS([line({ variationName: 'Vinyl Decal Prints' })], null)
    expect(result).toEqual({ amountCents: 500, selection: null, fallbackUsed: false })
    expect(mockGetRate).not.toHaveBeenCalled()
  })

  it('re-priced selection includes the per-box packaging fee', async () => {
    mockGetSettings.mockResolvedValue({
      ...SETTINGS,
      packagingFeesCents: { single_acrylic: 300, frame: 0, '3_frames': 0 }
    })
    mockGetRate.mockResolvedValue(rate('r_sel', '8.00'))
    const result = await priceUS([line({ quantity: 2 })], 'r_sel') // 2 boxes → +$6
    expect(result.fallbackUsed).toBe(false)
    expect(result.amountCents).toBe(800 + 600)
    expect(result.selection?.amountCents).toBe(800 + 600)
  })

  it('falls back to the flat fee when the selected rate is missing/expired', async () => {
    mockGetRate.mockResolvedValue(null)
    const result = await priceUS([line({})], 'r_gone')
    expect(result).toEqual({ amountCents: 1000, selection: null, fallbackUsed: true })
  })
})

describe('per-country no-live-rate policy (DAN-490)', () => {
  const CA_ADDRESS = { ...ADDRESS, city: 'Toronto', state: 'ON', zip: 'M5V 2T6', country: 'CA' }
  const DECAL = { variationName: 'Vinyl Decal Prints' }

  it('Canada + Shippo error -> blocked (no flat fee by default)', async () => {
    mockCreateShipment.mockRejectedValue(new Error('network'))
    const result = await quoteRates(CA_ADDRESS, [line({})], 'CA')
    expect(result).toEqual({ kind: 'blocked', reason: 'no_live_rate' })
  })

  it('Canada + no rates -> blocked', async () => {
    mockCreateShipment.mockResolvedValue({ shipmentId: 'shp_1', rates: [], messages: ['no service'] })
    const result = await quoteRates(CA_ADDRESS, [line({})], 'CA')
    expect(result).toEqual({ kind: 'blocked', reason: 'no_live_rate' })
  })

  it('Canada with live rates still gets them', async () => {
    mockCreateShipment.mockResolvedValue({ shipmentId: 'shp_1', rates: [rate('r', '30.00')], messages: [] })
    const result = await quoteRates(CA_ADDRESS, [line({})], 'CA')
    expect(result.kind).toBe('rates')
  })

  it('Puerto Rico falls back to the global flat fee like the US', async () => {
    mockCreateShipment.mockRejectedValue(new Error('network'))
    const result = await quoteRates({ ...ADDRESS, state: 'PR', zip: '00901' }, [line({})], 'PR')
    expect(result).toEqual({ kind: 'flat', amountCents: 1000, reason: 'fallback' })
  })

  it('US fallback uses the stored fallbackFlatCents unchanged', async () => {
    mockGetSettings.mockResolvedValue({ ...SETTINGS, fallbackFlatCents: 1234 })
    mockCreateShipment.mockRejectedValue(new Error('network'))
    const result = await quoteRates(ADDRESS, [line({})], 'US')
    expect(result).toEqual({ kind: 'flat', amountCents: 1234, reason: 'fallback' })
  })

  it('a disabled country never gets a flat fee, even if configured as flat', async () => {
    mockGetSettings.mockResolvedValue({
      ...SETTINGS,
      countries: { GB: { enabled: false, decalFlatCents: null, noLiveRate: 'flat', noLiveRateFlatCents: 900 } }
    })
    mockCreateShipment.mockRejectedValue(new Error('network'))
    const result = await quoteRates({ ...ADDRESS, country: 'GB' }, [line({})], 'GB')
    expect(result).toEqual({ kind: 'blocked', reason: 'no_live_rate' })
  })

  it('an admin-given per-country flat fee (+ decal override) is used', async () => {
    mockGetSettings.mockResolvedValue({
      ...SETTINGS,
      countries: { CA: { enabled: true, decalFlatCents: 700, noLiveRate: 'flat', noLiveRateFlatCents: 2500 } }
    })
    mockCreateShipment.mockRejectedValue(new Error('network'))
    const result = await quoteRates(CA_ADDRESS, [line({}), line(DECAL)], 'CA')
    expect(result).toEqual({ kind: 'flat', amountCents: 2500 + 700, reason: 'fallback' })
  })

  it('decals-only cart uses the per-country decal fee (default = global)', async () => {
    expect(await quoteRates(CA_ADDRESS, [line(DECAL)], 'CA')).toEqual({
      kind: 'flat',
      amountCents: 500,
      reason: 'decals_only'
    })
    mockGetSettings.mockResolvedValue({
      ...SETTINGS,
      countries: { CA: { enabled: true, decalFlatCents: 900, noLiveRate: 'block', noLiveRateFlatCents: null } }
    })
    expect(await quoteRates(CA_ADDRESS, [line(DECAL)], 'CA')).toEqual({
      kind: 'flat',
      amountCents: 900,
      reason: 'decals_only'
    })
  })

  it('priceShipping: Canada with a missing/expired rate -> blocked', async () => {
    mockGetRate.mockResolvedValue(null)
    expect(await priceShipping([line({})], 'r_gone', 'CA')).toEqual({ blocked: true, reason: 'no_live_rate' })
    expect(await priceShipping([line({})], null, 'CA')).toEqual({ blocked: true, reason: 'no_live_rate' })
  })

  it('priceShipping: Canada with a valid rate is re-priced normally', async () => {
    mockGetRate.mockResolvedValue(rate('r_ca', '30.00'))
    const result = await priceShipping([line({})], 'r_ca', 'CA')
    expect(result).toMatchObject({ amountCents: 3000, fallbackUsed: false })
  })
})
