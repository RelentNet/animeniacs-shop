'use client'

import { useState } from 'react'

export function NewsletterSignupStub() {
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // Real submission is wired up in a later phase. For now, acknowledge
    // the click inline so users see something happen but no email is sent.
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <output className="text-sm text-gray-700">Thanks — newsletter signup launching soon.</output>
    )
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
