import 'server-only'
import { getProductById } from '@/lib/products/cache'

export interface CartLineInput {
  catalogItemId: string
  variationId: string
  quantity: number
  expectedUnitPriceCents: number
}

export interface ValidatedLine {
  catalogItemId: string
  variationId: string
  quantity: number
  unitPriceCents: number
  name: string
}

export interface ValidationMismatch {
  catalogItemId: string
  variationId: string
  expected: number
  actual: number | null
}

export type ValidationResult =
  | { ok: true; lines: ValidatedLine[] }
  | { ok: false; mismatches: ValidationMismatch[] }

const DRIFT_TOLERANCE_CENTS = 1

export async function validateCart(items: CartLineInput[]): Promise<ValidationResult> {
  const uniqueIds = Array.from(new Set(items.map((i) => i.catalogItemId)))
  const productEntries = await Promise.all(
    uniqueIds.map(async (id) => [id, await getProductById(id)] as const)
  )
  const productMap = new Map(productEntries)

  const mismatches: ValidationMismatch[] = []
  const lines: ValidatedLine[] = []

  for (const item of items) {
    const product = productMap.get(item.catalogItemId)
    if (!product) {
      mismatches.push({
        catalogItemId: item.catalogItemId,
        variationId: item.variationId,
        expected: item.expectedUnitPriceCents,
        actual: null
      })
      continue
    }
    const variation = product.variations.find((v) => v.id === item.variationId)
    if (!variation?.price) {
      mismatches.push({
        catalogItemId: item.catalogItemId,
        variationId: item.variationId,
        expected: item.expectedUnitPriceCents,
        actual: null
      })
      continue
    }
    const actual = variation.price.amount
    if (Math.abs(actual - item.expectedUnitPriceCents) > DRIFT_TOLERANCE_CENTS) {
      mismatches.push({
        catalogItemId: item.catalogItemId,
        variationId: item.variationId,
        expected: item.expectedUnitPriceCents,
        actual
      })
      continue
    }
    lines.push({
      catalogItemId: item.catalogItemId,
      variationId: item.variationId,
      quantity: item.quantity,
      unitPriceCents: actual,
      name: product.name
    })
  }

  if (mismatches.length > 0) return { ok: false, mismatches }
  return { ok: true, lines }
}
