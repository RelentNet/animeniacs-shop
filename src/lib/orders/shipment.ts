/**
 * Pure (no I/O) extraction of shipment details from a stored Square order
 * snapshot (`orders.raw`). Sources the FIRST `fulfillments[]` entry whose
 * `type === 'SHIPMENT'` that carries `shipmentDetails`. Returns null when there
 * is no such fulfillment (e.g. a DIGITAL order) so the admin view can render a
 * clean empty state. Unit-testable; surfaced read-only in the order detail.
 */

export interface ParsedShipment {
  /** Recipient display name, or null. */
  recipientName: string | null
  /** Ordered, ready-to-render address lines (empty parts omitted). */
  addressLines: string[]
  carrier: string | null
  shippingType: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  /** ISO timestamp string Square reported, or null. */
  shippedAt: string | null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Render a Square Address into display lines: street, optional line 2, a
 * combined "City, State ZIP" line (built from whichever parts exist), country.
 * Empty parts are dropped so a sparse address never yields blank lines.
 */
// biome-ignore lint/suspicious/noExplicitAny: Square Address shape is loose
function formatAddressLines(address: any): string[] {
  if (!address || typeof address !== 'object') return []
  const lines: string[] = []
  const line1 = str(address.addressLine1)
  const line2 = str(address.addressLine2)
  if (line1) lines.push(line1)
  if (line2) lines.push(line2)

  const city = str(address.locality)
  const region = str(address.administrativeDistrictLevel1)
  const postal = str(address.postalCode)
  // "City, State ZIP" — join city + region with a comma, then append ZIP.
  const cityRegion = [city, region].filter(Boolean).join(', ')
  const localityLine = [cityRegion, postal].filter(Boolean).join(' ').trim()
  if (localityLine) lines.push(localityLine)

  const country = str(address.country)
  if (country) lines.push(country)
  return lines
}

/**
 * Extract the order's shipment, or null if it has no SHIPMENT fulfillment with
 * details. Accepts the loose stored `raw` snapshot.
 */
// biome-ignore lint/suspicious/noExplicitAny: stored Square order snapshot is loose
export function parseShipment(raw: any): ParsedShipment | null {
  const fulfillments = raw?.fulfillments
  if (!Array.isArray(fulfillments)) return null

  const shipment = fulfillments.find((f) => f?.type === 'SHIPMENT' && f?.shipmentDetails != null)
  if (!shipment) return null

  const details = shipment.shipmentDetails
  const recipient = details?.recipient
  return {
    recipientName: str(recipient?.displayName),
    addressLines: formatAddressLines(recipient?.address),
    carrier: str(details?.carrier),
    shippingType: str(details?.shippingType),
    trackingNumber: str(details?.trackingNumber),
    trackingUrl: str(details?.trackingUrl),
    shippedAt: str(details?.shippedAt)
  }
}
