'use client'

import { cartReducer, totalQuantity } from '@/lib/cart/reducer'
import { CART_STORAGE_KEY, readPersistedCart, writePersistedCart } from '@/lib/cart/storage'
import { INITIAL_CART_STATE, type CartEntry } from '@/lib/cart/types'
import { type ReactNode, useCallback, useEffect, useMemo, useReducer } from 'react'
import { CartDrawer } from './CartDrawer'
import { CartContext, type UseCartReturn } from './useCart'

interface CartProviderProps {
  children: ReactNode
}

export function CartProvider({ children }: CartProviderProps): JSX.Element {
  const [state, dispatch] = useReducer(cartReducer, INITIAL_CART_STATE)

  // Hydrate from localStorage on mount.
  useEffect(() => {
    dispatch({ type: 'HYDRATE', items: readPersistedCart() })
  }, [])

  // Persist on item change (only after hydration to avoid clobbering the
  // persisted cart with the empty initial state).
  useEffect(() => {
    if (!state.isHydrated) return
    writePersistedCart(state.items)
  }, [state.isHydrated, state.items])

  // Cross-tab sync: when another tab modifies the same key, re-hydrate.
  // We do NOT sync drawer state — drawer is intentionally per-tab.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== CART_STORAGE_KEY) return
      dispatch({ type: 'HYDRATE', items: readPersistedCart() })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const addItem = useCallback((entry: Omit<CartEntry, 'addedAt'>) => {
    dispatch({ type: 'ADD_ITEM', entry })
  }, [])

  const removeItem = useCallback((catalogItemId: string, variationId: string) => {
    dispatch({ type: 'REMOVE_ITEM', catalogItemId, variationId })
  }, [])

  const setQuantity = useCallback(
    (catalogItemId: string, variationId: string, quantity: number) => {
      dispatch({ type: 'SET_QUANTITY', catalogItemId, variationId, quantity })
    },
    []
  )

  const clear = useCallback(() => dispatch({ type: 'CLEAR' }), [])
  const openDrawer = useCallback(() => dispatch({ type: 'OPEN_DRAWER' }), [])
  const closeDrawer = useCallback(() => dispatch({ type: 'CLOSE_DRAWER' }), [])

  const value = useMemo<UseCartReturn>(
    () => ({
      items: state.items,
      isDrawerOpen: state.isDrawerOpen,
      isHydrated: state.isHydrated,
      totalQuantity: totalQuantity(state.items),
      addItem,
      removeItem,
      setQuantity,
      clear,
      openDrawer,
      closeDrawer
    }),
    [state, addItem, removeItem, setQuantity, clear, openDrawer, closeDrawer]
  )

  return (
    <CartContext.Provider value={value}>
      {children}
      <CartDrawer />
    </CartContext.Provider>
  )
}
