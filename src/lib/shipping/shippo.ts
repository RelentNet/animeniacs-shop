import 'server-only'
import type { Parcel } from './parcels'

/**
 * Minimal Shippo REST client (no SDK dependency — raw HTTP, validated against
 * the live API). Used only to QUOTE rates at checkout; label purchase stays a
 * post-order team step in the Shippo dashboard.
 *
 * Auth: `Authorization: ShippoToken <SHIPPO_API_TOKEN>`. The token is runtime-
 * only (never required at build time); we throw if a rate is requested without it.
 */

const SHIPPO_BASE = 'https://api.goshippo.com'

export interface ShippoAddress {
  name: string
  street1: string
  street2?: string
  city: string
  state: string
  zip: string
  /** ISO 3166-1 alpha-2. */
  country: string
  phone?: string
  email?: string
}

export interface ShippoRate {
  rateId: string
  shipmentId: string
  amountCents: number
  currency: string
  /** Carrier, e.g. "USPS", "DHL Express". */
  carrier: string
  /** Service level display name, e.g. "Priority Mail International". */
  service: string
  /** Shippo service-level token, e.g. "usps_priority". */
  serviceToken: string | null
  /** Carrier ETA in days, when provided. */
  estimatedDays: number | null
}

export interface CreateShipmentResult {
  shipmentId: string | null
  rates: ShippoRate[]
  /** Carrier/account notices Shippo returns (out-of-service-area, etc.). */
  messages: string[]
}

function token(): string {
  const t = process.env.SHIPPO_API_TOKEN
  if (!t) throw new Error('SHIPPO_API_TOKEN is not set. Add it to .env.local / Coolify before rating.')
  return t
}

function headers(): HeadersInit {
  return {
    Authorization: `ShippoToken ${token()}`,
    'Content-Type': 'application/json'
  }
}

/** Decimal-string amount ("7.95") → integer cents (795), robust to float drift. */
function amountToCents(amount: unknown): number {
  const n = typeof amount === 'string' ? Number.parseFloat(amount) : Number(amount)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

// biome-ignore lint/suspicious/noExplicitAny: Shippo JSON is loosely typed
function parseRate(r: any): ShippoRate | null {
  const rateId = typeof r?.object_id === 'string' ? r.object_id : null
  if (!rateId) return null
  return {
    rateId,
    shipmentId: typeof r?.shipment === 'string' ? r.shipment : '',
    amountCents: amountToCents(r?.amount),
    currency: typeof r?.currency === 'string' ? r.currency : 'USD',
    carrier: typeof r?.provider === 'string' ? r.provider : 'Carrier',
    service: typeof r?.servicelevel?.name === 'string' ? r.servicelevel.name : 'Shipping',
    serviceToken: typeof r?.servicelevel?.token === 'string' ? r.servicelevel.token : null,
    estimatedDays:
      typeof r?.estimated_days === 'number' ? r.estimated_days : null
  }
}

function parcelPayload(parcels: Parcel[]): unknown[] {
  return parcels.map((p) => ({
    length: String(p.lengthIn),
    width: String(p.widthIn),
    height: String(p.heightIn),
    distance_unit: 'in',
    weight: String(p.weightLb),
    mass_unit: 'lb'
  }))
}

function addressPayload(a: ShippoAddress): unknown {
  return {
    name: a.name,
    street1: a.street1,
    street2: a.street2 ?? '',
    city: a.city,
    state: a.state,
    zip: a.zip,
    country: a.country,
    phone: a.phone ?? '',
    email: a.email ?? ''
  }
}

/**
 * Creates a synchronous Shippo shipment and returns its rates. Throws on
 * network / non-2xx so the quote layer can fall back to the flat fee.
 */
export async function createShipment(args: {
  from: ShippoAddress
  to: ShippoAddress
  parcels: Parcel[]
}): Promise<CreateShipmentResult> {
  const res = await fetch(`${SHIPPO_BASE}/shipments/`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      address_from: addressPayload(args.from),
      address_to: addressPayload(args.to),
      parcels: parcelPayload(args.parcels),
      async: false
    })
  })
  if (!res.ok) {
    throw new Error(`Shippo shipments create failed: ${res.status} ${await res.text().catch(() => '')}`)
  }
  // biome-ignore lint/suspicious/noExplicitAny: Shippo JSON is loosely typed
  const body: any = await res.json()
  const rawRates: unknown[] = Array.isArray(body?.rates) ? body.rates : []
  const rates = rawRates.map(parseRate).filter((r): r is ShippoRate => r !== null)
  const messages: string[] = Array.isArray(body?.messages)
    ? body.messages
        // biome-ignore lint/suspicious/noExplicitAny: loose
        .map((m: any) => (typeof m?.text === 'string' ? m.text : ''))
        .filter((t: string) => t.length > 0)
    : []
  return {
    shipmentId: typeof body?.object_id === 'string' ? body.object_id : null,
    rates,
    messages
  }
}

/**
 * Retrieves a single rate by id (used to RE-PRICE the buyer's selection
 * server-side at /api/checkout — we never trust a client-sent amount). Returns
 * null if the rate is gone/expired or the call fails.
 */
export async function getRate(rateId: string): Promise<ShippoRate | null> {
  try {
    const res = await fetch(`${SHIPPO_BASE}/rates/${encodeURIComponent(rateId)}`, {
      method: 'GET',
      headers: headers()
    })
    if (!res.ok) return null
    return parseRate(await res.json())
  } catch {
    return null
  }
}
