import { createAuthClient } from 'better-auth/react'

/**
 * better-auth client for client components (sign-in / sign-up / sign-out forms).
 * `baseURL` is left to the SDK default (same-origin `/api/auth`) in the browser;
 * NEXT_PUBLIC_SITE_URL pins it when present so SSR / non-browser callers resolve
 * the right origin.
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_SITE_URL
})

export const { signIn, signUp, signOut, useSession } = authClient
