'use server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { removeFromWishlist } from '@/lib/db/queries/wishlists'
import { revalidatePath } from 'next/cache'

/**
 * Remove a product from the signed-in user's wishlist, driven by the
 * `/account/wishlist` row form (the `productId` rides in the FormData). Auth is
 * enforced server-side.
 */
export async function removeWishlistItemAction(form: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user.isAuthenticated || !user.userId) {
    return
  }
  const productId = form.get('productId')
  if (typeof productId !== 'string' || !productId) {
    return
  }
  await removeFromWishlist(user.userId, productId)
  revalidatePath('/account/wishlist')
  revalidatePath(`/product/${productId}`)
}
