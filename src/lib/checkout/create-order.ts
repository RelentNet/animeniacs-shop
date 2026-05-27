import 'server-only'
import { getSquareClient } from '@/lib/square/client'
import type { ValidatedLine } from './validate-cart'

export interface CreateOrderArgs {
  lines: ValidatedLine[]
  cartId: string
  locationId: string
}

export async function createSquareOrder(args: CreateOrderArgs): Promise<{ orderId: string }> {
  const client = getSquareClient()
  const response = await client.orders.create({
    idempotencyKey: args.cartId,
    order: {
      locationId: args.locationId,
      referenceId: args.cartId,
      lineItems: args.lines.map((line) => ({
        catalogObjectId: line.variationId,
        quantity: String(line.quantity)
      })),
      metadata: { cart_id: args.cartId }
    }
  })
  // biome-ignore lint/suspicious/noExplicitAny: SDK return shape varies
  const orderId = (response as any).order?.id
  if (typeof orderId !== 'string' || orderId.length === 0) {
    throw new Error('Square orders.create returned no order id')
  }
  return { orderId }
}
