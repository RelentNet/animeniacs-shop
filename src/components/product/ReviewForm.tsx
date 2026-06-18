'use client'

import { type ReviewFormState, submitReviewAction } from '@/app/product/[id]/reviews/actions'
import { useFormState } from 'react-dom'
import { StarRatingInput } from './StarRating'

/**
 * Signed-in review submission form (Tailwind). `useFormState` drives the
 * success / pending / duplicate banners. `productId` is carried as a hidden
 * field; everything authoritative (verified-purchase, publish state) is decided
 * server-side.
 */
export function ReviewForm({ productId }: { productId: string }): JSX.Element {
  const [state, formAction] = useFormState<ReviewFormState, FormData>(submitReviewAction, {})

  if (state.ok) {
    return (
      <output className="alert alert-ok block">
        {state.pending
          ? 'Thanks — your review is pending approval and will appear once a moderator publishes it.'
          : 'Thanks — your review has been published.'}
      </output>
    )
  }

  return (
    <form action={formAction} className="mt-2 max-w-xl space-y-4" encType="multipart/form-data">
      <input type="hidden" name="productId" value={productId} />

      {state.error === 'duplicate' ? (
        <p role="alert" className="alert alert-warn">
          You have already reviewed this product.
        </p>
      ) : null}
      {state.error === 'auth' ? (
        <p role="alert" className="alert alert-error">
          Please sign in to write a review.
        </p>
      ) : null}
      {state.error === 'server' ? (
        <p role="alert" className="alert alert-error">
          Something went wrong. Please try again.
        </p>
      ) : null}

      <div>
        <StarRatingInput />
        {state.fieldErrors?.rating ? (
          <p className="mt-1 text-sm text-red-300">{state.fieldErrors.rating}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="review-title" className="field-label">
          Title <span className="text-faint">(optional)</span>
        </label>
        <input id="review-title" name="title" maxLength={120} className="field-input mt-2" />
      </div>

      <div>
        <label htmlFor="review-body" className="field-label">
          Your review
        </label>
        <textarea id="review-body" name="body" rows={4} className="field-textarea mt-2" />
        {state.fieldErrors?.body ? (
          <p className="mt-1 text-sm text-red-300">{state.fieldErrors.body}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="review-photos" className="field-label">
          Photos <span className="text-faint">(optional, up to 4)</span>
        </label>
        <input
          id="review-photos"
          name="photos"
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          className="mt-2 block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-neon file:px-3 file:py-2 file:text-sm file:font-semibold file:text-ink hover:file:bg-[#5cff3d]"
        />
        {state.fieldErrors?.photos ? (
          <p className="mt-1 text-sm text-red-300">{state.fieldErrors.photos}</p>
        ) : null}
      </div>

      <button type="submit" className="btn-neon">
        Submit review
      </button>
    </form>
  )
}
