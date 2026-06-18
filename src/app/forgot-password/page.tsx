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
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-16">
      <div className="enter">
        <p className="eyebrow">Account recovery</p>
        <h1 className="font-display mt-2 text-5xl text-bone md:text-6xl">Reset password</h1>
        <p className="mt-2 text-muted">Enter your email and we’ll send you a link to reset it.</p>

        {submitted ? (
          <output className="alert alert-ok mt-8 block">
            If an account exists for that email, we’ve sent a password reset link.
          </output>
        ) : (
          <form onSubmit={onSubmit} className="panel mt-8 space-y-5 p-6 md:p-7">
            <div>
              <label htmlFor="email" className="field-label">
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
                className="field-input mt-2"
              />
            </div>

            <button type="submit" disabled={loading} className="btn-neon w-full justify-center">
              {loading ? 'Sending…' : 'Send reset link'}
              {loading ? null : <span aria-hidden="true">→</span>}
            </button>
          </form>
        )}

        <p className="mt-6 text-sm text-muted">
          <Link href={'/sign-in' as Route} className="link-neon font-medium">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
