'use client'

import { authClient } from '@/lib/auth-client'
import { useState } from 'react'

/**
 * Sign-out control (Phase 15, better-auth). Replaces the old `/sign-out` Logto
 * route link. Clears the session via the auth client then hard-navigates home
 * so every server gate re-renders without the session cookie.
 */
export function SignOutButton({ className }: { className?: string }): JSX.Element {
  const [loading, setLoading] = useState(false)

  async function onClick(): Promise<void> {
    setLoading(true)
    await authClient.signOut()
    window.location.href = '/'
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={className ?? 'text-gray-700 hover:underline disabled:opacity-60'}
    >
      {loading ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
