import { z } from 'zod'
import type { CartEntry } from './types'

export const CART_STORAGE_KEY = 'animeniacs_cart_v1'
export const MAX_PERSISTED_ENTRIES = 50

const CartEntrySchema = z.object({
  catalogItemId: z.string().min(1),
  variationId: z.string().min(1),
  quantity: z.number().int().positive(),
  addedAt: z.string().datetime()
})
const PersistedCartSchema = z.array(CartEntrySchema)

/**
 * Reads the persisted cart from localStorage.
 *
 * Returns [] on any failure mode (missing key, malformed JSON, schema mismatch,
 * localStorage unavailable). Never throws — the cart UI should not be able to
 * crash the page because the storage layer hiccuped.
 */
export function readPersistedCart(): CartEntry[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    const result = PersistedCartSchema.safeParse(parsed)
    return result.success ? result.data : []
  } catch {
    return []
  }
}

/**
 * Writes the cart to localStorage. Caps at MAX_PERSISTED_ENTRIES (oldest-first
 * truncation by addedAt) as a defensive safeguard against runaway state.
 * Silently no-ops if localStorage is unavailable.
 */
export function writePersistedCart(items: readonly CartEntry[]): void {
  try {
    let toWrite: readonly CartEntry[] = items
    if (items.length > MAX_PERSISTED_ENTRIES) {
      const sorted = [...items].sort((a, b) => a.addedAt.localeCompare(b.addedAt))
      toWrite = sorted.slice(sorted.length - MAX_PERSISTED_ENTRIES)
    }
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(toWrite))
  } catch {
    // Storage unavailable (private browsing, SSR, etc.) — silently skip.
  }
}
