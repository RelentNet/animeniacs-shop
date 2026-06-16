import 'server-only'
import {
  ADMIN_TARGET_STATES,
  type FulfillmentState,
  NoFulfillmentError,
  isAllowedTransition
} from '@/lib/orders/fulfillment-states'
import { getSquareClient } from '@/lib/square/client'

// Re-export the pure transition logic so existing importers of these symbols
// from this module keep working. The pure logic lives in
// '@/lib/orders/fulfillment-states' (no server-only) so client components can
// import it without pulling in the Square client.
export { ADMIN_TARGET_STATES, type FulfillmentState, NoFulfillmentError, isAllowedTransition }

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
