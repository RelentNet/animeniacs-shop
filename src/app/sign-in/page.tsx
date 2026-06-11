'use client'

import { authClient } from '@/lib/auth-client'
import { postLoginDestination } from '@/lib/auth/post-login-destination'
import type { Route } from 'next'
import Link from 'next/link'
import { type FormEvent, useState } from 'react'

/**
 * Email + password sign-in (Phase 15, better-auth). Replaces the old hosted
 * OIDC redirect. On success we do a full-page navigation (not router.push) so the
 * freshly-set session cookie is present when the server gates re-render; admins
 * land on /admin, everyone else on /account.
 */
export default function SignInPage(): JSX.Element {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { data, error: err } = await authClient.signIn.email({ email, password })
    if (err) {
      setError(err.message ?? 'Could not sign in. Check your email and password.')
      setLoading(false)
      return
    }
    const role = (data?.user as { role?: string } | undefined)?.role
    window.location.href = postLoginDestination(role === 'admin' ? ['admin'] : [])
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900">Sign in</h1>
      <p className="mt-1 text-sm text-gray-600">Welcome back to Animeniacs.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {error ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

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

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-60"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-sm text-gray-600">
        Don’t have an account?{' '}
        <Link
          href={'/sign-up' as Route}
          className="font-medium text-gray-900 underline hover:no-underline"
        >
          Create one
        </Link>
      </p>
    </div>
  )
}
