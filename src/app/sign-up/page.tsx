'use client'

import { authClient } from '@/lib/auth-client'
import type { Route } from 'next'
import Link from 'next/link'
import { type FormEvent, useState } from 'react'

/**
 * Email + password sign-up (Phase 15, better-auth). Email verification is OFF
 * this phase, so a successful sign-up establishes a session immediately and we
 * navigate straight to the account area. New accounts are never admin (the
 * `role` column defaults to 'user'); admin is granted out-of-band via
 * `pnpm auth:grant-admin`.
 */
export default function SignUpPage(): JSX.Element {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: err } = await authClient.signUp.email({ name, email, password })
    if (err) {
      setError(err.message ?? 'Could not create your account. Please try again.')
      setLoading(false)
      return
    }
    window.location.href = '/account'
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-16">
      <div className="enter">
        <p className="eyebrow">Join the crew</p>
        <h1 className="font-display mt-2 text-5xl text-bone md:text-6xl">Create account</h1>
        <p className="mt-2 text-muted">Track orders, save addresses, and more.</p>

        <form onSubmit={onSubmit} className="panel mt-8 space-y-5 p-6 md:p-7">
          {error ? (
            <p role="alert" className="alert alert-error">
              {error}
            </p>
          ) : null}

          <div>
            <label htmlFor="name" className="field-label">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="field-input mt-2"
            />
          </div>

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
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field-input mt-2"
            />
            <p className="mt-1.5 text-xs text-faint">At least 8 characters.</p>
          </div>

          <button type="submit" disabled={loading} className="btn-neon w-full justify-center">
            {loading ? 'Creating account…' : 'Create account'}
            {loading ? null : <span aria-hidden="true">→</span>}
          </button>
        </form>

        <p className="mt-6 text-sm text-muted">
          Already have an account?{' '}
          <Link href={'/sign-in' as Route} className="link-neon font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
