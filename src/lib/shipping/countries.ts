/**
 * Shipping destinations.
 *
 * The CANDIDATE list (US, Puerto Rico, Canada, UK, EU-27) is fixed in code; the
 * operator decides in /admin/shipping which candidates are open and what each is
 * charged when there is no live carrier rate. That per-country config lives in
 * the `shipping` site_settings JSON (see ShippingSettingsSchema) and is resolved
 * here with pure helpers so client and server code share one source of truth.
 *
 * Defaults (nothing stored): US, PR, CA open; every other candidate closed.
 * US + PR fall back to the global flat fee when live rating fails; CA and every
 * other candidate BLOCK checkout instead of charging a flat fee they were never
 * given (DAN-490).
 *
 * Pure module (no I/O) so it's importable from server routes, client components
 * and tests.
 */

export interface CountryOption {
  code: string
  name: string
}

/** EU-27 member states, alphabetical by English name. */
const EU_27: ReadonlyArray<CountryOption> = [
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'HR', name: 'Croatia' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czechia' },
  { code: 'DK', name: 'Denmark' },
  { code: 'EE', name: 'Estonia' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'GR', name: 'Greece' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IT', name: 'Italy' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MT', name: 'Malta' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'RO', name: 'Romania' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'ES', name: 'Spain' },
  { code: 'SE', name: 'Sweden' }
]

/**
 * Every country the admin can open, in dropdown order. The admin cannot add
 * countries outside this list.
 */
export const CANDIDATE_COUNTRIES: ReadonlyArray<CountryOption> = [
  { code: 'US', name: 'United States' },
  { code: 'PR', name: 'Puerto Rico' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  ...EU_27
]

const CANDIDATE_CODES: ReadonlySet<string> = new Set(CANDIDATE_COUNTRIES.map((c) => c.code))

/** What happens when no live carrier rate is available for an address. */
export type NoLiveRateMode = 'flat' | 'block'

/** Per-country shipping config, as stored in the `shipping` settings JSON. */
export interface CountryShippingConfig {
  enabled: boolean
  /** Decal flat fee in cents; null = use the global `decalFlatCents`. */
  decalFlatCents: number | null
  /** No live rate (Shippo error / no rates / expired rate): charge a flat fee, or block checkout. */
  noLiveRate: NoLiveRateMode
  /** Flat fee for `noLiveRate: 'flat'`, in cents; null = use the global `fallbackFlatCents`. */
  noLiveRateFlatCents: number | null
}

/** Countries open out of the box, and the ones allowed a flat no-live-rate fee by default. */
const DEFAULT_ENABLED: ReadonlySet<string> = new Set(['US', 'PR', 'CA'])
const DEFAULT_FLAT_NO_LIVE_RATE: ReadonlySet<string> = new Set(['US', 'PR'])

export function defaultCountryConfig(code: string): CountryShippingConfig {
  return {
    enabled: DEFAULT_ENABLED.has(code),
    decalFlatCents: null,
    noLiveRate: DEFAULT_FLAT_NO_LIVE_RATE.has(code) ? 'flat' : 'block',
    noLiveRateFlatCents: null
  }
}

export type CountryConfigMap = Record<string, CountryShippingConfig>

/** Normalizes a country input ("us", "Us ") to a 2-letter upper code. */
export function normalizeCountry(input: string | null | undefined): string {
  return (input ?? '').trim().toUpperCase()
}

export function isCandidateCountry(country: string | null | undefined): boolean {
  return CANDIDATE_CODES.has(normalizeCountry(country))
}

/**
 * The effective config for one country. Non-candidates are always closed; a
 * candidate missing from `countries` (e.g. settings saved before DAN-490) gets
 * its default.
 */
export function countryConfig(
  countries: CountryConfigMap | null | undefined,
  country: string | null | undefined
): CountryShippingConfig {
  const code = normalizeCountry(country)
  if (!CANDIDATE_CODES.has(code)) {
    return { enabled: false, decalFlatCents: null, noLiveRate: 'block', noLiveRateFlatCents: null }
  }
  return countries?.[code] ?? defaultCountryConfig(code)
}

/** True when the admin has opened this country for shipping. */
export function isShippable(
  countries: CountryConfigMap | null | undefined,
  country: string | null | undefined
): boolean {
  return countryConfig(countries, country).enabled
}

/** Dropdown options for checkout: the enabled candidates, in candidate order. */
export function enabledCountryOptions(
  countries: CountryConfigMap | null | undefined
): CountryOption[] {
  return CANDIDATE_COUNTRIES.filter((c) => countryConfig(countries, c.code).enabled)
}

export interface CountryFees {
  /** Decal flat fee (cents) for this destination. */
  decalFlatCents: number
  /** Flat fee (cents) when no live rate exists, or null when checkout must be blocked. */
  noLiveRateFlatCents: number | null
}

/**
 * Resolve the money side of a country's config against the global fees. Only
 * an enabled country ever gets a flat amount.
 */
export function resolveCountryFees(
  settings: {
    decalFlatCents: number
    fallbackFlatCents: number
    countries?: CountryConfigMap | null
  },
  country: string | null | undefined
): CountryFees {
  const cfg = countryConfig(settings.countries, country)
  return {
    decalFlatCents: cfg.decalFlatCents ?? settings.decalFlatCents,
    noLiveRateFlatCents:
      cfg.enabled && cfg.noLiveRate === 'flat'
        ? (cfg.noLiveRateFlatCents ?? settings.fallbackFlatCents)
        : null
  }
}
