'use client'

import { authClient } from '@/lib/auth-client'
import type { Route } from 'next'
import Link from 'next/link'
import { type FormEvent, useState } from 'react'

/**
 * Forgot-password request page (Phase 19, better-auth). Collects an email and
 * fires `authClient.requestPasswordReset({ email, redirectTo: '/reset-password' })`,
 * which hits the live `POST /api/auth/request-password-reset` endpoint. The
 * server emails a one-time link of the form
 * `{origin}/reset-password/{token}?callbackURL=/reset-password`, which redirects
 * the buyer to `/reset-password?token=...`.
 *
 * Anti-enumeration: we ALWAYS show the same generic success message regardless
 * of whether the email exists or the request errors — the response must not let
 * a caller distinguish a registered email from an unregistered one. Styling
 * mirrors /sign-in.
 */
export default function ForgotPasswordPage(): JSX.Element {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setLoading(true)
    // Ignore the result entirely (anti-enumeration): success and failure both
    // resolve to the same generic confirmation. We still await so the button
    // stays disabled until the request settles.
    await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' })
    setLoading(false)
    setSubmitted(true)
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900">Reset your password</h1>
      <p className="mt-1 text-sm text-gray-600">
        Enter your email and we’ll send you a link to reset it.
      </p>

      {submitted ? (
        <output className="mt-6 block rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          If an account exists for that email, we’ve sent a password reset link.
        </output>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-60"
          >
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}

      <p className="mt-6 text-sm text-gray-600">
        <Link
          href={'/sign-in' as Route}
          className="font-medium text-gray-900 underline hover:no-underline"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
