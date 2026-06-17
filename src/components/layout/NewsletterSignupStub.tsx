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
      <output className="text-sm text-neon-soft">
        You're in. Watch your inbox for the next drop.
      </output>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm gap-2">
      <label htmlFor="newsletter-email" className="sr-only">
        Email
      </label>
      <input
        id="newsletter-email"
        type="email"
        required
        placeholder="you@example.com"
        className="min-w-0 flex-1 rounded-md border border-line-strong bg-wall px-3 py-2 text-sm text-bone placeholder:text-faint focus:border-neon focus:outline-none"
      />
      <button type="submit" className="btn-neon !px-4 !py-2 text-sm">
        Subscribe
      </button>
    </form>
  )
}
