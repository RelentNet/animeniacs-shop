const STARS = [1, 2, 3, 4, 5] as const

/**
 * Read-only star display. Rounds `value` to the nearest whole star and renders
 * a filled/empty row with an accessible label ("4.5 out of 5 stars").
 */
export function StarRating({
  value,
  count
}: {
  value: number
  count?: number
}): JSX.Element {
  const rounded = Math.round(value)
  const label =
    count === undefined
      ? `${value.toFixed(1)} out of 5 stars`
      : `${value.toFixed(1)} out of 5 stars from ${count} review${count === 1 ? '' : 's'}`

  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label}>
      {STARS.map((star) => (
        <span
          key={star}
          aria-hidden="true"
          className={star <= rounded ? 'text-amber-500' : 'text-gray-300'}
        >
          ★
        </span>
      ))}
    </span>
  )
}

/**
 * Accessible radio-based rating input. Native radios keep it functional without
 * client JS; the labels are visually star-shaped but announce "N stars".
 */
export function StarRatingInput({
  name = 'rating',
  defaultValue
}: {
  name?: string
  defaultValue?: number
}): JSX.Element {
  return (
    <fieldset className="border-0 p-0">
      <legend className="text-sm font-medium text-gray-900">Your rating</legend>
      <div className="mt-1 inline-flex items-center gap-1">
        {STARS.map((star) => (
          <label key={star} className="cursor-pointer text-2xl text-amber-500">
            <input
              type="radio"
              name={name}
              value={star}
              defaultChecked={defaultValue === star}
              className="sr-only"
              aria-label={`${star} star${star === 1 ? '' : 's'}`}
            />
            <span aria-hidden="true">☆</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
