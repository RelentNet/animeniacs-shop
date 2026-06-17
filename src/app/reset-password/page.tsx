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
      <div className="mx-auto max-w-md px-4 py-12">
        <h1 className="text-2xl font-bold text-gray-900">Reset your password</h1>
        <p role="alert" className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          This password reset link is invalid or expired.
        </p>
        <p className="mt-6 text-sm text-gray-600">
          <Link
            href={'/forgot-password' as Route}
            className="font-medium text-gray-900 underline hover:no-underline"
          >
            Request a new link
          </Link>
        </p>
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
      <div className="mx-auto max-w-md px-4 py-12">
        <h1 className="text-2xl font-bold text-gray-900">Password reset</h1>
        <output className="mt-6 block rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Your password has been reset. Redirecting you to sign in…
        </output>
        <p className="mt-6 text-sm text-gray-600">
          <Link
            href={'/sign-in' as Route}
            className="font-medium text-gray-900 underline hover:no-underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900">Choose a new password</h1>
      <p className="mt-1 text-sm text-gray-600">Enter and confirm your new password.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {error ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div>
          <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
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
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
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
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-60"
        >
          {loading ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
    </div>
  )
}

export default function ResetPasswordPage(): JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-4 py-12">
          <h1 className="text-2xl font-bold text-gray-900">Reset your password</h1>
          <p className="mt-1 text-sm text-gray-600">Loading…</p>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  )
}
