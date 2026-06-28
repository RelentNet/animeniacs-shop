'use client'

import {
  CART_BADGE_DELIVERY,
  CART_BADGE_HANGING_STRIPS,
  CART_BADGE_SHIPPING,
  CART_BADGE_SUPPORT_ARTIST
} from '@/lib/site-copy'
import * as Dialog from '@radix-ui/react-dialog'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import styles from './CartDrawer.module.css'
import { CartLine } from './CartLine'
import { useCart } from './useCart'
import { useCartHydration } from './useCartHydration'

function lineKey(catalogItemId: string, variationId: string): string {
  return `${catalogItemId}::${variationId}`
}

export function CartDrawer(): JSX.Element {
  const { items, isDrawerOpen, openDrawer, closeDrawer, totalQuantity, removeItem } = useCart()
  const { products, isLoading } = useCartHydration()
  const router = useRouter()
  const prevOpenRef = useRef(isDrawerOpen)
  const warnedKeysRef = useRef<Set<string>>(new Set())
  const processedThisOpenRef = useRef(false)

  // Decision 9: auto-strip stale entries on the SECOND drawer open after
  // staleness is first detected. Mechanism:
  //   - When the drawer transitions open→true, reset "processed for this
  //     open session" flag.
  //   - Once products data is available for the items in cart (i.e. the
  //     hydration fetch has resolved), process exactly once:
  //       - Stale entry not in warnedKeysRef → add key, leave in cart
  //         (user sees "No longer available" badge).
  //       - Stale entry already in warnedKeysRef → removeItem.
  //   - When the drawer closes, no-op (state preserved for next open).
  useEffect(() => {
    const justOpened = isDrawerOpen && !prevOpenRef.current
    prevOpenRef.current = isDrawerOpen
    if (justOpened) {
      processedThisOpenRef.current = false
    }
    if (!isDrawerOpen || processedThisOpenRef.current || items.length === 0) return

    // Only process once products has data for every item in cart, or the
    // hydration fetch has settled (isLoading flips back to false).
    const allItemsHaveProductData = items.every((entry) => entry.catalogItemId in products)
    if (!allItemsHaveProductData) return

    processedThisOpenRef.current = true
    for (const entry of items) {
      const product = products[entry.catalogItemId]
      const variation = product?.variations.find((v) => v.id === entry.variationId)
      const isStale = product === null || !variation
      if (!isStale) continue
      const key = lineKey(entry.catalogItemId, entry.variationId)
      if (warnedKeysRef.current.has(key)) {
        removeItem(entry.catalogItemId, entry.variationId)
      } else {
        warnedKeysRef.current.add(key)
      }
    }
  }, [isDrawerOpen, items, products, removeItem])

  const subtotalCents = items.reduce((sum, entry) => {
    const product = products[entry.catalogItemId]
    if (!product) return sum
    const variation = product.variations.find((v) => v.id === entry.variationId)
    if (!variation?.price) return sum
    return sum + variation.price.amount * entry.quantity
  }, 0)

  // Address + live shipping rates are now collected on the dedicated /checkout
  // page (Shippo dynamic shipping) before the Square redirect. The drawer just
  // navigates there.
  function goToCheckout(): void {
    if (items.length === 0) return
    closeDrawer()
    router.push('/checkout' as Route)
  }

  return (
    <Dialog.Root open={isDrawerOpen} onOpenChange={(o) => (o ? openDrawer() : closeDrawer())}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content} aria-describedby={undefined}>
          <Dialog.Title className={styles.title}>Your cart ({totalQuantity})</Dialog.Title>

          {items.length === 0 ? (
            <p className={styles.empty}>Your cart is empty.</p>
          ) : (
            <ul className={styles.lines}>
              {items.map((entry) => (
                <CartLine
                  key={lineKey(entry.catalogItemId, entry.variationId)}
                  entry={entry}
                  product={products[entry.catalogItemId]}
                  isHydrating={isLoading && !(entry.catalogItemId in products)}
                />
              ))}
            </ul>
          )}

          <footer className={styles.footer}>
            <div className={styles.subtotal}>
              <span>Subtotal</span>
              <span data-testid="cart-subtotal">${(subtotalCents / 100).toFixed(2)}</span>
            </div>
            <ul className={styles.badges}>
              <li>{CART_BADGE_SHIPPING}</li>
              <li>{CART_BADGE_DELIVERY}</li>
              <li>{CART_BADGE_HANGING_STRIPS}</li>
              <li>{CART_BADGE_SUPPORT_ARTIST}</li>
            </ul>
            <button
              type="button"
              onClick={goToCheckout}
              disabled={items.length === 0}
              className={styles.checkout}
            >
              Checkout
            </button>
          </footer>

          <Dialog.Close className={styles.close} aria-label="Close cart">
            ×
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
