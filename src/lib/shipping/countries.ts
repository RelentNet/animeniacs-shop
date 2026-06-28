/**
 * Shippable-country allowlist. Enforced BEFORE a Square payment link is created
 * (the hosted checkout itself has no country restriction). Opens US, Canada, UK,
 * and the EU-27 per the operator; everything else is rejected at the rate step.
 *
 * Pure module (no I/O) so it's importable from both server routes and tests.
 */

/** EU-27 member-state ISO 3166-1 alpha-2 codes. */
const EU_27 = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE'
] as const

/** Full shippable set: US + Canada + United Kingdom + EU-27. */
export const SHIPPABLE_COUNTRIES: ReadonlySet<string> = new Set<string>([
  'US',
  'CA',
  'GB',
  ...EU_27
])

/** Normalizes a country input ("us", "Us ", "USA"→no) to a 2-letter upper code. */
export function normalizeCountry(input: string | null | undefined): string {
  return (input ?? '').trim().toUpperCase()
}

/** True when we ship to the given country (ISO alpha-2, case-insensitive). */
export function isShippable(country: string | null | undefined): boolean {
  return SHIPPABLE_COUNTRIES.has(normalizeCountry(country))
}

/**
 * Labeled options for the checkout country selector. US/CA/UK first, then the
 * EU-27 alphabetically. Kept in sync with SHIPPABLE_COUNTRIES.
 */
export const SHIPPABLE_COUNTRY_OPTIONS: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
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
