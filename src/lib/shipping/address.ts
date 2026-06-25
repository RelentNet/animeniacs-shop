import { z } from 'zod'
import { normalizeCountry } from './countries'
import type { ShippoAddress } from './shippo'

/**
 * The buyer's shipping address, collected on our own site before payment.
 * Shared by the rates endpoint, the checkout endpoint, and the Square
 * payment-link pre-population. Validated with Zod on the untrusted boundary.
 */
export const CheckoutAddressSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional().default(''),
  city: z.string().trim().min(1).max(120),
  // Optional: some international destinations have no state/province.
  state: z.string().trim().max(120).optional().default(''),
  zip: z.string().trim().min(1).max(20),
  country: z
    .string()
    .trim()
    .transform((c) => normalizeCountry(c))
    .pipe(z.string().length(2)),
  phone: z.string().trim().max(40).optional().default(''),
  email: z.string().trim().email().max(200).or(z.literal('')).optional().default('')
})

export type CheckoutAddress = z.infer<typeof CheckoutAddressSchema>

/** Buyer full name for carrier labels. */
export function fullName(a: CheckoutAddress): string {
  return `${a.firstName} ${a.lastName}`.trim()
}

/** Convert to the Shippo rating "address_to" shape. */
export function toShippoAddress(a: CheckoutAddress): ShippoAddress {
  return {
    name: fullName(a),
    street1: a.line1,
    street2: a.line2 || undefined,
    city: a.city,
    state: a.state,
    zip: a.zip,
    country: a.country,
    phone: a.phone || undefined,
    email: a.email || undefined
  }
}

/** Convert to the Square `Address` shape used in `prePopulatedData.buyerAddress`. */
export function toSquareAddress(a: CheckoutAddress): {
  addressLine1: string
  addressLine2?: string
  locality: string
  administrativeDistrictLevel1?: string
  postalCode: string
  country: string
} {
  return {
    addressLine1: a.line1,
    ...(a.line2 ? { addressLine2: a.line2 } : {}),
    locality: a.city,
    ...(a.state ? { administrativeDistrictLevel1: a.state } : {}),
    postalCode: a.zip,
    country: a.country
  }
}
