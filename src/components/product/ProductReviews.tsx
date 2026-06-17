import { getCurrentUser } from '@/lib/auth/get-current-user'
import {
  getPublishedReviewsForProduct,
  getReviewSummary,
  getUserReviewForProduct
} from '@/lib/db/queries/reviews'
import type { Review } from '@/lib/db/schema'
import Image from 'next/image'
import { ReviewForm } from './ReviewForm'
import { StarRating } from './StarRating'

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function ReviewCard({ review }: { review: Review }): JSX.Element {
  return (
    <li className="border-t border-line py-5">
      <div className="flex flex-wrap items-center gap-2">
        <StarRating value={review.rating} />
        {review.title ? <span className="font-semibold text-bone">{review.title}</span> : null}
        {review.isVerifiedPurchase ? (
          <span className="rounded-full border border-neon/40 bg-neon/10 px-2 py-0.5 text-xs font-medium text-neon">
            Verified Purchase
          </span>
        ) : null}
      </div>

      <p className="mt-2 whitespace-pre-line text-sm text-muted">{review.body}</p>

      {review.photoUrls.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {review.photoUrls.map((url) => (
            <li key={url}>
              <Image
                src={url}
                alt="Review photo"
                width={80}
                height={80}
                className="h-20 w-20 rounded object-cover"
              />
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-2 text-xs text-faint">
        <span className="font-medium text-muted">{review.authorName ?? 'Anonymous'}</span>
        {' · '}
        {formatDate(review.createdAt)}
      </p>
    </li>
  )
}

/**
 * Product-page reviews section (server component). Reads the published-only
 * summary + list, and — for a signed-in user — decides between the review form
 * and a "you reviewed this" note. Anonymous visitors see published reviews plus
 * a sign-in prompt.
 */
export async function ProductReviews({ productId }: { productId: string }): Promise<JSX.Element> {
  const [summary, reviews, user] = await Promise.all([
    getReviewSummary(productId),
    getPublishedReviewsForProduct(productId),
    getCurrentUser()
  ])

  const existingReview =
    user.isAuthenticated && user.userId
      ? await getUserReviewForProduct(user.userId, productId)
      : undefined

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl tracking-wide text-bone">Reviews</h2>
        {summary.count > 0 ? (
          <span className="flex items-center gap-2 text-sm text-muted">
            <StarRating value={summary.average} count={summary.count} />
            <span>
              {summary.average.toFixed(1)} · {summary.count} review
              {summary.count === 1 ? '' : 's'}
            </span>
          </span>
        ) : null}
      </div>

      <div className="mt-6">
        {!user.isAuthenticated ? (
          <p className="text-sm text-muted">
            <a href="/sign-in" className="link-neon font-medium text-neon-soft">
              Sign in
            </a>{' '}
            to write a review.
          </p>
        ) : existingReview ? (
          <p className="rounded-md border border-line bg-wall-2 px-3 py-2 text-sm text-muted">
            You reviewed this product.
          </p>
        ) : (
          <ReviewForm productId={productId} />
        )}
      </div>

      {reviews.length > 0 ? (
        <ul className="mt-6">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-sm text-faint">
          No reviews yet. Be the first to review this product.
        </p>
      )}
    </div>
  )
}
