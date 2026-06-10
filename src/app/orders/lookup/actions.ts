'use server'

import { getOrderBySquareOrderIdAndEmail } from '@/lib/db/queries/orders'
import type { Order } from '@/lib/db/schema'

// SECURITY: one generic message for EVERY failure path — wrong email, wrong
// order number, or a missing field. Never disclose which part was wrong; that
// would let an attacker probe valid order numbers / emails independently.
const GENERIC_ERROR = "We couldn't find an order matching that email and order number."

export interface LookupState {
  ok?: boolean
  order?: Order
  error?: string
}

function readField(form: FormData, key: string): string {
  const value = form.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Guest order lookup. Requires BOTH the buyer email AND the exact order number
 * (the shared secret printed on checkout-success). Returns the read-only order
 * on an exact, case-insensitive-email match; otherwise a single generic error.
 *
 * Rate-limiting / lockout is a documented Phase 14 follow-up (spec §2/§6).
 */
export async function lookupOrderAction(_prev: LookupState, form: FormData): Promise<LookupState> {
  const email = readField(form, 'email').toLowerCase()
  const orderNumber = readField(form, 'orderNumber')

  if (!email || !orderNumber) {
    return { error: GENERIC_ERROR }
  }

  const order = await getOrderBySquareOrderIdAndEmail(orderNumber, email)
  if (!order) {
    return { error: GENERIC_ERROR }
  }

  return { ok: true, order }
}
