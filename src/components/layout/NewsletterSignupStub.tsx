'use client'

export function NewsletterSignupStub() {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // Real submission wired up in Phase 9
    alert('Newsletter signup wires up in Phase 9.')
  }
  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <label htmlFor="newsletter-email" className="sr-only">
        Email
      </label>
      <input
        id="newsletter-email"
        type="email"
        required
        placeholder="you@example.com"
        className="rounded border border-gray-300 px-3 py-1 text-sm"
      />
      <button
        type="submit"
        className="rounded border border-gray-300 bg-gray-100 px-3 py-1 text-sm"
      >
        Subscribe
      </button>
    </form>
  )
}
