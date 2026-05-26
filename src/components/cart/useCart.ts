'use client'

import type { CartEntry } from '@/lib/cart/types'
import { createContext, useContext } from 'react'

export interface UseCartReturn {
  // Read-only state
  items: readonly CartEntry[]
  isDrawerOpen: boolean
  isHydrated: boolean
  totalQuantity: number

  // Mutations
  addItem: (entry: Omit<CartEntry, 'addedAt'>) => void
  removeItem: (catalogItemId: string, variationId: string) => void
  setQuantity: (catalogItemId: string, variationId: string, quantity: number) => void
  clear: () => void

  // Drawer
  openDrawer: () => void
  closeDrawer: () => void
}

export const CartContext = createContext<UseCartReturn | null>(null)

export function useCart(): UseCartReturn {
  const ctx = useContext(CartContext)
  if (!ctx) {
    throw new Error('useCart() must be called inside <CartProvider>.')
  }
  return ctx
}
