'use client'

import { useCart } from '@/components/cart/useCart'
import { useEffect } from 'react'

const SESSION_KEY = 'clearedCartId'

interface CartClearerProps {
  cartId: string | undefined
}

/**
 * Invisible client component. On mount, clears the cart once for the
 * current cartId. Uses sessionStorage as an idempotency guard so a
 * buyer bookmarking the success URL and returning later with a new
 * cart does not accidentally wipe it.
 *
 * Renders null — no visible output.
 */
export function CartClearer({ cartId }: CartClearerProps): null {
  const { clear } = useCart()

  useEffect(() => {
    if (!cartId) return
    if (sessionStorage.getItem(SESSION_KEY) === cartId) return
    clear()
    sessionStorage.setItem(SESSION_KEY, cartId)
  }, [cartId, clear])

  return null
}
