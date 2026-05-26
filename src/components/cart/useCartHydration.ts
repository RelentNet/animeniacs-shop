'use client'

import type { CachedProduct } from '@/lib/square/types'
import { useEffect, useState } from 'react'
import { useCart } from './useCart'

interface HydrationState {
  /** Keyed by catalogItemId. `null` means hydration returned null (stale entry). */
  products: Record<string, CachedProduct | null>
  isLoading: boolean
  /** Bumps an internal version counter, forcing a re-fetch with the same ids. */
  refresh: () => void
}

export function useCartHydration(): HydrationState {
  const { items, isHydrated } = useCart()
  const [products, setProducts] = useState<Record<string, CachedProduct | null>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [version, setVersion] = useState(0)

  // Derive a stable sorted comma-joined key of catalog ids. The hook only
  // refetches when this string changes (or version bumps), so adding/removing
  // items refetches but quantity edits do not.
  const sortedIds = Array.from(new Set(items.map((i) => i.catalogItemId))).sort()
  const idsKey = sortedIds.join(',')

  useEffect(() => {
    // Read version so the deps list isn't flagged as containing an unused
    // dependency. The value itself isn't used; the bump is what re-runs
    // this effect on refresh().
    void version
    if (!isHydrated) return
    if (idsKey === '') {
      setProducts({})
      return
    }
    let cancelled = false
    setIsLoading(true)
    const ids = idsKey.split(',')
    fetch('/api/cart/hydrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        setProducts(data?.products ?? {})
      })
      .catch(() => {
        if (cancelled) return
        // Network failure: treat every cart item as null so the drawer
        // renders "No longer available" badges. User can close+reopen
        // to retry via refresh().
        const fallback: Record<string, null> = {}
        for (const id of ids) fallback[id] = null
        setProducts(fallback)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [idsKey, isHydrated, version])

  return { products, isLoading, refresh: () => setVersion((v) => v + 1) }
}
