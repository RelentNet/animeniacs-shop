'use client'

export default function CheckoutSuccessError({
  error,
  reset
}: {
  error: Error
  reset: () => void
}): JSX.Element {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center md:py-24">
      <p className="eyebrow">Order confirmed</p>
      <h1 className="font-display mt-2 text-4xl text-bone md:text-5xl">Thanks for your order!</h1>
      <p className="mt-4 text-muted">
        Your payment was received. You&apos;ll get a confirmation email from Square shortly.
      </p>
      <button type="button" onClick={reset} className="btn-ghost mt-6">
        Reload
      </button>
      <details className="mt-8 text-left text-xs text-faint">
        <summary className="cursor-pointer">Technical details</summary>
        <code className="mt-2 block break-all">{error.message}</code>
      </details>
    </main>
  )
}
