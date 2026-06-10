import 'server-only'
import { db } from '@/lib/db/client'
import { type NewReview, type Review, reviews } from '@/lib/db/schema'
import { and, desc, eq, sql } from 'drizzle-orm'

/**
 * Thrown when `createReview` hits the `reviews_user_product_unique` constraint
 * (one review per user per product). Surfaced to the form as a friendly
 * "you already reviewed this" message rather than a 500.
 */
export class AlreadyReviewedError extends Error {
  constructor(message = 'You have already reviewed this product.') {
    super(message)
    this.name = 'AlreadyReviewedError'
  }
}

export interface ReviewSummary {
  count: number
  average: number
}

/**
 * Insert a review and return the persisted row. `isVerifiedPurchase` /
 * `isPublished` / `orderId` / `authorName` are server-computed by the caller —
 * never accepted from form input. A unique-constraint violation (Postgres
 * `23505`) becomes `AlreadyReviewedError`.
 */
export async function createReview(input: NewReview): Promise<Review> {
  try {
    const [row] = await db.insert(reviews).values(input).returning()
    return row
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      throw new AlreadyReviewedError()
    }
    throw err
  }
}

/**
 * Published reviews for a product, newest first. PUBLIC read — only published
 * reviews are ever returned here.
 */
export async function getPublishedReviewsForProduct(productId: string): Promise<Review[]> {
  return db
    .select()
    .from(reviews)
    .where(and(eq(reviews.productId, productId), eq(reviews.isPublished, true)))
    .orderBy(desc(reviews.createdAt))
}

/**
 * Count + average rating over PUBLISHED reviews for a product. `average` is 0
 * when there are no published reviews.
 */
export async function getReviewSummary(productId: string): Promise<ReviewSummary> {
  const rows = await db
    .select({
      count: sql<number>`count(*)`,
      average: sql<number>`avg(${reviews.rating})`
    })
    .from(reviews)
    .where(and(eq(reviews.productId, productId), eq(reviews.isPublished, true)))

  const row = rows[0]
  return {
    count: Number(row?.count ?? 0),
    average: Number(row?.average ?? 0)
  }
}

/**
 * The signed-in user's existing review for a product (any publish state), or
 * undefined. Used to decide whether to show the form or a "you reviewed this"
 * note.
 */
export async function getUserReviewForProduct(
  userId: string,
  productId: string
): Promise<Review | undefined> {
  const rows = await db
    .select()
    .from(reviews)
    .where(and(eq(reviews.userId, userId), eq(reviews.productId, productId)))
    .limit(1)
  return rows[0]
}

/** All unpublished reviews awaiting moderation, newest first. ADMIN-only. */
export async function getPendingReviews(): Promise<Review[]> {
  return db
    .select()
    .from(reviews)
    .where(eq(reviews.isPublished, false))
    .orderBy(desc(reviews.createdAt))
}

/** Publish a held review. */
export async function publishReview(id: string): Promise<void> {
  await db
    .update(reviews)
    .set({ isPublished: true, updatedAt: new Date() })
    .where(eq(reviews.id, id))
}

/** Permanently delete a review. */
export async function deleteReview(id: string): Promise<void> {
  await db.delete(reviews).where(eq(reviews.id, id))
}
