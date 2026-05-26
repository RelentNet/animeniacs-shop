import type { CartAction, CartEntry, CartState } from './types'

/**
 * Sums quantities across cart entries. Used by the `useCart()` hook
 * to expose `totalQuantity` for the header badge.
 */
export function totalQuantity(items: readonly CartEntry[]): number {
  return items.reduce((sum, e) => sum + e.quantity, 0)
}

function findIndex(
  items: readonly CartEntry[],
  catalogItemId: string,
  variationId: string
): number {
  return items.findIndex((e) => e.catalogItemId === catalogItemId && e.variationId === variationId)
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'HYDRATE':
      return { ...state, items: [...action.items], isHydrated: true }

    case 'ADD_ITEM': {
      const idx = findIndex(state.items, action.entry.catalogItemId, action.entry.variationId)
      if (idx >= 0) {
        const next = [...state.items]
        next[idx] = { ...next[idx], quantity: next[idx].quantity + action.entry.quantity }
        return { ...state, items: next }
      }
      const newEntry: CartEntry = {
        catalogItemId: action.entry.catalogItemId,
        variationId: action.entry.variationId,
        quantity: action.entry.quantity,
        addedAt: new Date().toISOString()
      }
      return { ...state, items: [...state.items, newEntry] }
    }

    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter(
          (e) => !(e.catalogItemId === action.catalogItemId && e.variationId === action.variationId)
        )
      }

    case 'SET_QUANTITY': {
      if (action.quantity <= 0) {
        return cartReducer(state, {
          type: 'REMOVE_ITEM',
          catalogItemId: action.catalogItemId,
          variationId: action.variationId
        })
      }
      const idx = findIndex(state.items, action.catalogItemId, action.variationId)
      if (idx < 0) return state
      const next = [...state.items]
      next[idx] = { ...next[idx], quantity: action.quantity }
      return { ...state, items: next }
    }

    case 'CLEAR':
      return { ...state, items: [] }

    case 'OPEN_DRAWER':
      return { ...state, isDrawerOpen: true }

    case 'CLOSE_DRAWER':
      return { ...state, isDrawerOpen: false }

    default: {
      // Exhaustiveness check.
      const _exhaustive: never = action
      return state
    }
  }
}
