'use client'

export default function CheckoutSuccessError({
  error,
  reset
}: {
  error: Error
  reset: () => void
}): JSX.Element {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="mb-3 text-2xl font-semibold">Thanks for your order!</h1>
      <p className="mb-4 text-gray-600">
        Your payment was received. You&apos;ll get a confirmation email from Square shortly.
      </p>
      <button type="button" onClick={reset} className="rounded bg-gray-900 px-4 py-2 text-white">
        Reload
      </button>
      <details className="mt-6 text-xs text-gray-400">
        <summary>Technical details</summary>
        <code>{error.message}</code>
      </details>
    </main>
  )
}
