import 'server-only'
import type { ValidatedLine } from '@/lib/checkout/validate-cart'
import { getShippingSettings } from '@/lib/db/queries/shipping-settings'
import { getCategoryNameMap } from '@/lib/square/categories'
import { classifyLine } from './classify'
import { type Parcel, packCart } from './parcels'
import { createShipment, getRate, type ShippoAddress } from './shippo'

/**
 * Quote orchestration: classify the cart → pack into boxes → fetch live Shippo
 * rates → fold in the percentage markup + the flat decal fee. The buyer PICKS a
 * rate. Decals/misc-only carts skip live rating and use the flat decal fee; any
 * rating failure falls back to the configurable flat fee (operator's choice).
 *
 * Money-critical: `priceShipping` re-prices the buyer's chosen rate server-side
 * from Shippo (never trusts a client-sent amount) before it sets the Square
 * shipping charge.
 */

export interface RateOption {
  rateId: string
  shipmentId: string
  carrier: string
  service: string
  /** All-in shipping cents for this option (carrier rate + markup + decal flat + packaging). */
  amountCents: number
  estimatedDays: number | null
}

export type QuoteResult =
  | { kind: 'rates'; options: RateOption[] }
  | { kind: 'flat'; amountCents: number; reason: 'decals_only' | 'fallback' }

/** Selected-and-priced shipping persisted for the fulfillment team. */
export interface ShippingSelection {
  rateId: string
  shipmentId: string
  carrier: string
  service: string
  /** All-in cents actually charged (markup + decal + packaging included). */
  amountCents: number
}

export interface PricedShipping {
  amountCents: number
  selection: ShippingSelection | null
  fallbackUsed: boolean
}

interface ClassCounts {
  acrylics: number
  frames: number
  flatUnits: number
}

/** Carrier-rate markup. Rounds to the nearest cent. */
export function applyMarkup(cents: number, markupPercent: number): number {
  if (!markupPercent) return cents
  return Math.round(cents * (1 + markupPercent / 100))
}

/**
 * Flat packaging-material surcharge for a shipment: the per-box-type fee summed
 * over every physical parcel (so a 2-acrylic order pays the single-acrylic fee
 * twice). Independent of carrier/speed — added on top of every rate option.
 */
export function packagingTotalCents(
  parcels: Parcel[],
  fees: Record<string, number>
): number {
  return parcels.reduce((sum, p) => sum + (fees[p.key] ?? 0), 0)
}

/** Counts acrylic / frame / flat units across the cart (resolving category names). */
async function classifyCart(lines: ValidatedLine[]): Promise<ClassCounts> {
  const catMap = await getCategoryNameMap()
  let acrylics = 0
  let frames = 0
  let flatUnits = 0
  for (const line of lines) {
    const categoryNames = line.categoryIds
      .map((id) => catMap.get(id))
      .filter((n): n is string => typeof n === 'string')
    const cls = classifyLine({ variationName: line.variationName, categoryNames })
    if (cls === 'acrylic') acrylics += line.quantity
    else if (cls === 'frame') frames += line.quantity
    else flatUnits += line.quantity
  }
  return { acrylics, frames, flatUnits }
}

/**
 * Live rate options for an address + cart. Returns `flat` for decals-only carts
 * and on any Shippo failure (fallback flat fee).
 */
export async function quoteRates(
  address: ShippoAddress,
  lines: ValidatedLine[]
): Promise<QuoteResult> {
  const settings = await getShippingSettings()
  const counts = await classifyCart(lines)
  const decalFlat = counts.flatUnits > 0 ? settings.decalFlatCents : 0
  const parcels = packCart({ acrylics: counts.acrylics, frames: counts.frames })
  const packaging = packagingTotalCents(parcels, settings.packagingFeesCents)

  if (parcels.length === 0) {
    return { kind: 'flat', amountCents: decalFlat, reason: 'decals_only' }
  }

  const fallbackCents = settings.fallbackFlatCents + decalFlat + packaging

  let result: Awaited<ReturnType<typeof createShipment>>
  try {
    result = await createShipment({ from: settings.shipFrom, to: address, parcels })
  } catch (err) {
    console.error('[shipping] rate fetch failed; using fallback flat fee:', err)
    return { kind: 'flat', amountCents: fallbackCents, reason: 'fallback' }
  }

  if (result.rates.length === 0) {
    console.warn('[shipping] no rates returned; using fallback flat fee. messages:', result.messages)
    return { kind: 'flat', amountCents: fallbackCents, reason: 'fallback' }
  }

  const options: RateOption[] = result.rates
    .map((r) => ({
      rateId: r.rateId,
      shipmentId: r.shipmentId || result.shipmentId || '',
      carrier: r.carrier,
      service: r.service,
      estimatedDays: r.estimatedDays,
      amountCents: applyMarkup(r.amountCents, settings.markupPercent) + decalFlat + packaging
    }))
    .sort((a, b) => a.amountCents - b.amountCents)

  return { kind: 'rates', options }
}

/**
 * Authoritative shipping price for the chosen rate, computed server-side at
 * checkout. For flat-only carts there is no rate to pick (returns the decal
 * flat). If the selected rate is missing/expired, falls back to the flat fee.
 */
export async function priceShipping(
  lines: ValidatedLine[],
  selectedRateId: string | null
): Promise<PricedShipping> {
  const settings = await getShippingSettings()
  const counts = await classifyCart(lines)
  const decalFlat = counts.flatUnits > 0 ? settings.decalFlatCents : 0
  const parcels = packCart({ acrylics: counts.acrylics, frames: counts.frames })
  const packaging = packagingTotalCents(parcels, settings.packagingFeesCents)

  if (parcels.length === 0) {
    return { amountCents: decalFlat, selection: null, fallbackUsed: false }
  }

  if (selectedRateId) {
    const rate = await getRate(selectedRateId)
    if (rate) {
      const amountCents = applyMarkup(rate.amountCents, settings.markupPercent) + decalFlat + packaging
      return {
        amountCents,
        selection: {
          rateId: rate.rateId,
          shipmentId: rate.shipmentId,
          carrier: rate.carrier,
          service: rate.service,
          amountCents
        },
        fallbackUsed: false
      }
    }
  }

  console.warn('[shipping] selected rate missing/expired; using fallback flat fee')
  return {
    amountCents: settings.fallbackFlatCents + decalFlat + packaging,
    selection: null,
    fallbackUsed: true
  }
}
