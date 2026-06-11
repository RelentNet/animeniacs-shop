import 'server-only'
import { getUserSquareCustomerId, setUserSquareCustomerId } from '@/lib/db/queries/user'
import { getSquareClient } from '@/lib/square/client'

/** Subset of the Square Customer we surface to callers (account pages). */
export interface SquareCustomer {
  id: string
  emailAddress?: string | null
  givenName?: string | null
  familyName?: string | null
  // biome-ignore lint/suspicious/noExplicitAny: Square Address shape is loose
  address?: any
}

/** The address fields we collect for a saved shipping address. */
export interface CustomerAddress {
  addressLine1: string
  addressLine2?: string
  locality: string
  administrativeDistrictLevel1: string
  postalCode: string
  country: string
}

function splitName(name: string | null): { givenName?: string; familyName?: string } {
  if (!name) return {}
  const trimmed = name.trim()
  if (!trimmed) return {}
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return { givenName: parts[0] }
  return { givenName: parts[0], familyName: parts.slice(1).join(' ') }
}

/**
 * Maps a logged-in buyer to exactly one Square Customer:
 *   1. `user.squareCustomerId` already set → return it (no Square call)
 *   2. else search Square by email → reuse + persist onto the user row
 *   3. else create (referenceId = user.id) + persist onto the user row
 * Throws if Square ultimately yields no customer id; the checkout caller
 * swallows that (best-effort — must never block payment).
 *
 * Phase 15: the mapping now lives on the `user` row (was the dropped
 * `customer_link` table).
 */
export async function findOrCreateSquareCustomer(opts: {
  userId: string
  email: string | null
  name: string | null
}): Promise<string> {
  const cached = await getUserSquareCustomerId(opts.userId)
  if (cached) {
    return cached
  }

  const client = getSquareClient()

  // Search by email first to avoid creating duplicate customers in Square.
  if (opts.email) {
    const searchResp = await client.customers.search({
      query: { filter: { emailAddress: { exact: opts.email } } },
      limit: BigInt(1)
    })
    // biome-ignore lint/suspicious/noExplicitAny: SDK response shape varies
    const found = (searchResp as any).customers?.[0]
    if (found?.id) {
      await setUserSquareCustomerId(opts.userId, found.id)
      return found.id
    }
  }

  const { givenName, familyName } = splitName(opts.name)
  const createResp = await client.customers.create({
    idempotencyKey: `cust_${opts.userId}`,
    referenceId: opts.userId,
    emailAddress: opts.email ?? undefined,
    givenName,
    familyName
  })
  // biome-ignore lint/suspicious/noExplicitAny: SDK response shape varies
  const created = (createResp as any).customer
  if (!created?.id) {
    throw new Error('Square customers.create returned no customer id')
  }

  await setUserSquareCustomerId(opts.userId, created.id)
  return created.id
}

export async function getSquareCustomer(customerId: string): Promise<SquareCustomer | null> {
  try {
    const resp = await getSquareClient().customers.get({ customerId })
    // biome-ignore lint/suspicious/noExplicitAny: SDK response shape varies
    const customer = (resp as any).customer
    return customer?.id ? (customer as SquareCustomer) : null
  } catch {
    return null
  }
}

export async function updateSquareCustomerAddress(
  customerId: string,
  address: CustomerAddress
): Promise<void> {
  await getSquareClient().customers.update({
    customerId,
    // biome-ignore lint/suspicious/noExplicitAny: Square Address.country is a Country enum
    address: address as any
  })
}
