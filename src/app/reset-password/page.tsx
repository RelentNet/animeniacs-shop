'use client'

import { authClient } from '@/lib/auth-client'
import type { Route } from 'next'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { type FormEvent, Suspense, useState } from 'react'

/**
 * Reset-password page (Phase 19, better-auth). The emailed link sends the buyer
 * to `{origin}/reset-password/{token}?callbackURL=/reset-password`, which the
 * server redirects to `/reset-password?token=...` (or `?error=INVALID_TOKEN`).
 * We read `token` from the query and POST it with the new password to
 * `authClient.resetPassword({ newPassword, token })` (live
 * POST /api/auth/reset-password).
 *
 * `useSearchParams()` opts a route out of static prerendering and MUST sit under
 * a <Suspense> boundary (otherwise `next build` deopts the whole page to CSR and
 * warns). We isolate the param-reading form in `ResetPasswordForm` and wrap it
 * in <Suspense> here so the page stays cleanly buildable and never touches the
 * DB at build time. Styling mirrors /sign-in.
 */

const MIN_PASSWORD_LENGTH = 8

function ResetPasswordForm(): JSX.Element {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  // Missing/blank token → the link is invalid or expired. Never call the API.
  if (!token) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-16">
        <div className="enter">
          <p className="eyebrow">Account recovery</p>
          <h1 className="font-display mt-2 text-5xl text-bone md:text-6xl">Reset password</h1>
          <p role="alert" className="alert alert-error mt-8">
            This password reset link is invalid or expired.
          </p>
          <p className="mt-6 text-sm text-muted">
            <Link href={'/forgot-password' as Route} className="link-neon font-medium">
              Request a new link
            </Link>
          </p>
        </div>
      </div>
    )
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setError(null)

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (newPassword !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error: err } = await authClient.resetPassword({
      newPassword,
      // `token` is non-null here — guarded by the early return above.
      token: token as string
    })
    if (err) {
      setError(err.message ?? 'This password reset link is invalid or expired. Request a new one.')
      setLoading(false)
      return
    }
    setLoading(false)
    setDone(true)
    router.push('/sign-in' as Route)
  }

  if (done) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-16">
        <div className="enter">
          <p className="eyebrow">Account recovery</p>
          <h1 className="font-display mt-2 text-5xl text-bone md:text-6xl">Password reset</h1>
          <output className="alert alert-ok mt-8 block">
            Your password has been reset. Redirecting you to sign in…
          </output>
          <p className="mt-6 text-sm text-muted">
            <Link href={'/sign-in' as Route} className="link-neon font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-16">
      <div className="enter">
        <p className="eyebrow">Account recovery</p>
        <h1 className="font-display mt-2 text-5xl text-bone md:text-6xl">New password</h1>
        <p className="mt-2 text-muted">Enter and confirm your new password.</p>

        <form onSubmit={onSubmit} className="panel mt-8 space-y-5 p-6 md:p-7">
          {error ? (
            <p role="alert" className="alert alert-error">
              {error}
            </p>
          ) : null}

          <div>
            <label htmlFor="newPassword" className="field-label">
              New password
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="field-input mt-2"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="field-label">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="field-input mt-2"
            />
          </div>

          <button type="submit" disabled={loading} className="btn-neon w-full justify-center">
            {loading ? 'Resetting…' : 'Reset password'}
            {loading ? null : <span aria-hidden="true">→</span>}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function ResetPasswordPage(): JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-16">
          <div>
            <p className="eyebrow">Account recovery</p>
            <h1 className="font-display mt-2 text-5xl text-bone md:text-6xl">Reset password</h1>
            <p className="mt-2 text-muted">Loading…</p>
          </div>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  )
}
