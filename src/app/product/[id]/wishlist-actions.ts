'use server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { addToWishlist, isInWishlist, removeFromWishlist } from '@/lib/db/queries/wishlists'
import { revalidatePath } from 'next/cache'

export interface WishlistToggleResult {
  inWishlist?: boolean
  needsAuth?: boolean
}

/**
 * Toggle a product on the signed-in user's wishlist. Auth is enforced
 * server-side; an anonymous caller gets `{ needsAuth: true }` and no write
 * happens. Returns the resulting membership state.
 */
export async function toggleWishlistAction(productId: string): Promise<WishlistToggleResult> {
  const user = await getCurrentUser()
  if (!user.isAuthenticated || !user.userId) {
    return { needsAuth: true }
  }

  const present = await isInWishlist(user.userId, productId)
  if (present) {
    await removeFromWishlist(user.userId, productId)
  } else {
    await addToWishlist(user.userId, productId)
  }

  revalidatePath(`/product/${productId}`)
  revalidatePath('/account/wishlist')
  return { inWishlist: !present }
}
