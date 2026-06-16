import 'server-only'
import { getSquareClient } from '@/lib/square/client'

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

export interface AdvanceFulfillmentArgs {
  squareOrderId: string
  toState: FulfillmentState
}

export interface AdvanceFulfillmentResult {
  fromState: string
  toState: FulfillmentState
}

/**
 * Push a fulfillment-state change to Square (Square stays source of truth; the
 * order.fulfillment.updated webhook reconciles our DB). Reads the authoritative
 * order for the optimistic-concurrency `version` + the fulfillment `uid`, then
 * updates that fulfillment's state. Throws {@link NoFulfillmentError} when the
 * order has no fulfillment. Maps an invalid/backward transition to an error
 * before calling Square. Does NOT write the DB.
 */
export async function advanceFulfillment(
  args: AdvanceFulfillmentArgs
): Promise<AdvanceFulfillmentResult> {
  const { squareOrderId, toState } = args

  if (!ADMIN_TARGET_STATES.includes(toState)) {
    throw new Error(`Invalid target fulfillment state: "${toState}".`)
  }

  const res = await getSquareClient().orders.get({ orderId: squareOrderId })
  // biome-ignore lint/suspicious/noExplicitAny: SDK response shape varies
  const order = (res as any).order
  const fulfillment = Array.isArray(order?.fulfillments) ? order.fulfillments[0] : undefined

  if (!fulfillment?.uid) {
    throw new NoFulfillmentError()
  }

  const fromState: string = fulfillment.state ?? 'PROPOSED'
  if (!isAllowedTransition(fromState, toState)) {
    throw new Error(`Disallowed fulfillment transition: ${fromState} → ${toState}.`)
  }

  await getSquareClient().orders.update({
    orderId: squareOrderId,
    idempotencyKey: `fulfill_${squareOrderId}_${toState}`,
    order: {
      locationId: order.locationId,
      version: order.version,
      fulfillments: [{ uid: fulfillment.uid, state: toState }]
    }
  })

  return { fromState, toState }
}
