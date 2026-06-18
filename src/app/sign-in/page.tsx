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
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-16">
      <div className="enter">
        <p className="eyebrow">Welcome back</p>
        <h1 className="font-display mt-2 text-5xl text-bone md:text-6xl">Sign in</h1>
        <p className="mt-2 text-muted">Pick up where you left off.</p>

        <form onSubmit={onSubmit} className="panel mt-8 space-y-5 p-6 md:p-7">
          {error ? (
            <p role="alert" className="alert alert-error">
              {error}
            </p>
          ) : null}

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

          <div>
            <label htmlFor="password" className="field-label">
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
              className="field-input mt-2"
            />
          </div>

          <button type="submit" disabled={loading} className="btn-neon w-full justify-center">
            {loading ? 'Signing in…' : 'Sign in'}
            {loading ? null : <span aria-hidden="true">→</span>}
          </button>

          <p className="text-sm">
            <Link href={'/forgot-password' as Route} className="link-neon">
              Forgot password?
            </Link>
          </p>
        </form>

        <p className="mt-6 text-sm text-muted">
          Don’t have an account?{' '}
          <Link href={'/sign-up' as Route} className="link-neon font-medium">
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
