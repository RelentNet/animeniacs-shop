/**
 * Cart state types. Pure data shapes; no React, no DOM.
 *
 * Phase 6 stores ID-only cart entries (Decision 3): the drawer hydrates
 * display details via POST /api/cart/hydrate so the cart can never
 * show stale prices or images.
 */

export interface CartEntry {
  /** Square catalog item id. */
  catalogItemId: string
  /** Square variation id. Always present even when item has one variation —
   *  storing it makes cart entries uniquely identifiable. */
  variationId: string
  /** Positive integer. SET_QUANTITY with quantity <= 0 acts as REMOVE. */
  quantity: number
  /** ISO-8601 timestamp set on first add; not changed on quantity merge. */
  addedAt: string
}

export interface CartState {
  items: CartEntry[]
  isDrawerOpen: boolean
  /** True only after the first client-side hydration from localStorage.
   *  Consumers defer rendering count-dependent UI until this flips true
   *  to prevent SSR/CSR mismatch warnings. */
  isHydrated: boolean
}

export type CartAction =
  | { type: 'HYDRATE'; items: CartEntry[] }
  | { type: 'ADD_ITEM'; entry: Omit<CartEntry, 'addedAt'> }
  | { type: 'REMOVE_ITEM'; catalogItemId: string; variationId: string }
  | { type: 'SET_QUANTITY'; catalogItemId: string; variationId: string; quantity: number }
  | { type: 'CLEAR' }
  | { type: 'OPEN_DRAWER' }
  | { type: 'CLOSE_DRAWER' }

export const INITIAL_CART_STATE: CartState = {
  items: [],
  isDrawerOpen: false,
  isHydrated: false
}
