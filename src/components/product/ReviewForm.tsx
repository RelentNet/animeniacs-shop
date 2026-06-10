'use client'

import { type ReviewFormState, submitReviewAction } from '@/app/product/[id]/reviews/actions'
import { useFormState } from 'react-dom'
import { StarRatingInput } from './StarRating'

const INPUT_CLASS =
  'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900'

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
      <output className="block rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
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
        <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You have already reviewed this product.
        </p>
      ) : null}
      {state.error === 'auth' ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Please sign in to write a review.
        </p>
      ) : null}
      {state.error === 'server' ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Something went wrong. Please try again.
        </p>
      ) : null}

      <div>
        <StarRatingInput />
        {state.fieldErrors?.rating ? (
          <p className="mt-1 text-sm text-red-600">{state.fieldErrors.rating}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="review-title" className="text-sm font-medium text-gray-900">
          Title <span className="text-gray-400">(optional)</span>
        </label>
        <input id="review-title" name="title" maxLength={120} className={INPUT_CLASS} />
      </div>

      <div>
        <label htmlFor="review-body" className="text-sm font-medium text-gray-900">
          Your review
        </label>
        <textarea id="review-body" name="body" rows={4} className={INPUT_CLASS} />
        {state.fieldErrors?.body ? (
          <p className="mt-1 text-sm text-red-600">{state.fieldErrors.body}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="review-photos" className="text-sm font-medium text-gray-900">
          Photos <span className="text-gray-400">(optional, up to 4)</span>
        </label>
        <input
          id="review-photos"
          name="photos"
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          className="mt-1 block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-900 file:px-3 file:py-2 file:text-sm file:text-white"
        />
        {state.fieldErrors?.photos ? (
          <p className="mt-1 text-sm text-red-600">{state.fieldErrors.photos}</p>
        ) : null}
      </div>

      <button
        type="submit"
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
      >
        Submit review
      </button>
    </form>
  )
}
