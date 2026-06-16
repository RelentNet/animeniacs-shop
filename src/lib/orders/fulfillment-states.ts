// Pure fulfillment-state logic (no I/O, no server-only). Safe to import from
// both client components (FulfillmentPanel) and the server-only Square wrapper.

/** Raw Square fulfillment states (Orders API). */
export type FulfillmentState =
  | 'PROPOSED'
  | 'RESERVED'
  | 'PREPARED'
  | 'COMPLETED'
  | 'CANCELED'
  | 'FAILED'

/** States an admin may advance an order TO (forward chain + cancel). */
export const ADMIN_TARGET_STATES: FulfillmentState[] = [
  'RESERVED',
  'PREPARED',
  'COMPLETED',
  'CANCELED'
]

/** Terminal states an admin cannot move out of. */
const TERMINAL_STATES = new Set<FulfillmentState>(['COMPLETED', 'CANCELED', 'FAILED'])

/** Forward progression rank for the happy path. */
const FORWARD_RANK: Record<string, number> = {
  PROPOSED: 0,
  RESERVED: 1,
  PREPARED: 2,
  COMPLETED: 3
}

/**
 * True when `from → to` is an allowed admin transition: forward along the
 * happy path, or → CANCELED from any non-terminal state. Backward moves and
 * moves out of a terminal state are rejected.
 */
export function isAllowedTransition(from: string, to: FulfillmentState): boolean {
  if (TERMINAL_STATES.has(from as FulfillmentState)) return false
  if (to === 'CANCELED') return true
  const fromRank = FORWARD_RANK[from]
  const toRank = FORWARD_RANK[to]
  if (fromRank === undefined || toRank === undefined) return false
  return toRank > fromRank
}

/**
 * Typed error thrown when the Square order carries no fulfillment to advance.
 * The action surfaces this clearly so the operator advances it once in Square
 * (spec §4.2 — Square Checkout payment-link orders DO carry a fulfillment in
 * sandbox, but this branch is kept defensively for any order that does not).
 */
export class NoFulfillmentError extends Error {
  readonly code = 'NO_FULFILLMENT' as const
  constructor(message = 'This order has no fulfillment to advance in Square.') {
    super(message)
    this.name = 'NoFulfillmentError'
  }
}
