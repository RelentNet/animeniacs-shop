'use client'

import { toggleWishlistAction } from '@/app/product/[id]/wishlist-actions'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

/**
 * Wishlist toggle (Tailwind heart). Optimistic-free: it calls the server action
 * and reflects the returned state. Anonymous users are routed to `/sign-in`
 * (the server action is the real auth gate — this is just a friendlier UX).
 */
export function WishlistButton({
  productId,
  inWishlist: initialInWishlist
}: {
  productId: string
  inWishlist: boolean
}): JSX.Element {
  const [inWishlist, setInWishlist] = useState(initialInWishlist)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleClick(): void {
    startTransition(async () => {
      const result = await toggleWishlistAction(productId)
      if (result.needsAuth) {
        router.push('/sign-in')
        return
      }
      if (typeof result.inWishlist === 'boolean') {
        setInWishlist(result.inWishlist)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={inWishlist}
      className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 transition hover:border-gray-900 disabled:opacity-50"
    >
      <span aria-hidden="true" className={inWishlist ? 'text-red-500' : 'text-gray-400'}>
        {inWishlist ? '♥' : '♡'}
      </span>
      {inWishlist ? 'In your wishlist' : 'Add to wishlist'}
    </button>
  )
}
