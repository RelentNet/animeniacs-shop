'use client'

export default function CategoryError({
  error,
  reset
}: {
  error: Error
  reset: () => void
}): JSX.Element {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center md:py-24">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="font-display mt-2 text-4xl text-bone md:text-5xl">Couldn't load this page</h1>
      <p className="mt-4 text-muted">Something went wrong. Try again, or come back later.</p>
      <button type="button" onClick={reset} className="btn-ghost mt-6">
        Try again
      </button>
      <details className="mt-8 text-left text-xs text-faint">
        <summary className="cursor-pointer">Technical details</summary>
        <code className="mt-2 block break-all">{error.message}</code>
      </details>
    </div>
  )
}
