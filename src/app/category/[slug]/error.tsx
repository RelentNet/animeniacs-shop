'use client'

export default function CategoryError({
  error,
  reset
}: {
  error: Error
  reset: () => void
}): JSX.Element {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="mb-3 text-2xl font-semibold">Couldn't load this page.</h1>
      <p className="mb-4 text-gray-600">
        Something went wrong. Try again, or come back later.
      </p>
      <button type="button" onClick={reset} className="rounded bg-gray-900 px-4 py-2 text-white">
        Try again
      </button>
      <details className="mt-6 text-xs text-gray-400">
        <summary>Technical details</summary>
        <code>{error.message}</code>
      </details>
    </div>
  )
}
