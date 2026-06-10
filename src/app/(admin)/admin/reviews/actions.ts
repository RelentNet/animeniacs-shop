'use server'

import { deleteReview, publishReview } from '@/lib/db/queries/reviews'
import { revalidatePath } from 'next/cache'

/**
 * Publish a held review. Revalidates the moderation list and the product page
 * (so the now-published review appears publicly). `productId` is bound from the
 * row so we can target the right product page.
 */
export async function publishReviewAction(id: string, productId: string): Promise<void> {
  await publishReview(id)
  revalidatePath('/admin/reviews')
  revalidatePath(`/product/${productId}`)
}

/** Permanently delete a review and refresh the moderation list + product page. */
export async function deleteReviewAction(id: string, productId: string): Promise<void> {
  await deleteReview(id)
  revalidatePath('/admin/reviews')
  revalidatePath(`/product/${productId}`)
}
