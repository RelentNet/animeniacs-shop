'use server'

import { randomUUID } from 'node:crypto'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { findPurchaseOrderId } from '@/lib/db/queries/orders'
import { AlreadyReviewedError, createReview } from '@/lib/db/queries/reviews'
import { saveReviewPhoto } from '@/lib/images/upload'
import { revalidatePath } from 'next/cache'

const MAX_PHOTOS = 4

export interface ReviewFormState {
  ok?: boolean
  /** true ⇒ held for moderation (non-verified); false ⇒ published immediately. */
  pending?: boolean
  /** Top-level failure category. */
  error?: 'auth' | 'duplicate' | 'server'
  fieldErrors?: { rating?: string; body?: string; photos?: string }
}

function readField(form: FormData, key: string): string {
  const value = form.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function readPhotos(form: FormData): File[] {
  return form
    .getAll('photos')
    .filter(
      (entry): entry is File =>
        typeof entry === 'object' && entry !== null && 'size' in entry && (entry as File).size > 0
    )
}

/**
 * Submit a product review. Auth is enforced server-side; `isVerifiedPurchase`,
 * `isPublished`, `orderId` and `authorName` are ALL server-computed and never
 * read from the form. Verified purchases auto-publish; everyone else is held
 * for moderation. See design §7.
 */
export async function submitReviewAction(
  _prev: ReviewFormState,
  form: FormData
): Promise<ReviewFormState> {
  const user = await getCurrentUser()
  if (!user.isAuthenticated || !user.userId) {
    return { error: 'auth' }
  }

  const productId = readField(form, 'productId')
  const title = readField(form, 'title')
  const body = readField(form, 'body')
  const rating = Number.parseInt(readField(form, 'rating'), 10)
  const photos = readPhotos(form)

  const fieldErrors: NonNullable<ReviewFormState['fieldErrors']> = {}
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    fieldErrors.rating = 'Please choose a rating from 1 to 5 stars.'
  }
  if (!body) {
    fieldErrors.body = 'Please write a few words about the product.'
  }
  if (photos.length > MAX_PHOTOS) {
    fieldErrors.photos = `Please attach at most ${MAX_PHOTOS} photos.`
  }
  if (!productId || Object.keys(fieldErrors).length > 0) {
    return { fieldErrors }
  }

  // Server-computed verification — never trusted from the client.
  const orderId = await findPurchaseOrderId(user.userId, productId)
  const isVerifiedPurchase = orderId !== null
  const isPublished = isVerifiedPurchase

  const reviewId = randomUUID()

  // Upload photos up front; a failure surfaces as a field error with no
  // partial review written.
  let photoUrls: string[] = []
  try {
    photoUrls = await Promise.all(
      photos.map((file, i) => saveReviewPhoto(file, `${reviewId}-${i}`))
    )
  } catch {
    return {
      fieldErrors: { photos: 'One of your photos could not be uploaded. Please try again.' }
    }
  }

  try {
    await createReview({
      id: reviewId,
      productId,
      userId: user.userId,
      orderId,
      rating,
      title: title || null,
      body,
      authorName: user.name,
      photoUrls,
      isVerifiedPurchase,
      isPublished
    })
  } catch (err) {
    if (err instanceof AlreadyReviewedError) {
      return { error: 'duplicate' }
    }
    console.error('[reviews] createReview failed:', err)
    return { error: 'server' }
  }

  revalidatePath(`/product/${productId}`)
  return { ok: true, pending: !isVerifiedPurchase }
}
