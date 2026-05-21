import { logtoConfig } from '@/lib/logto'
import { handleSignIn } from '@logto/next/server-actions'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Logto OIDC callback handler. Receives the auth code from Logto,
 * exchanges it for tokens via `handleSignIn`, then redirects to the
 * post-login destination.
 *
 * The redirect URI registered with Logto is /api/logto/callback,
 * so this file lives at the matching path.
 *
 * Post-login destination: /admin/artists for admin users (since they
 * came here through the admin gate). Public users hitting the
 * sign-in route directly would land on /account when that exists.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // handleSignIn finishes the OIDC dance and stores the session cookie.
  // Pass the full request URL so it can parse the `code` query param.
  await handleSignIn(logtoConfig, new URL(request.url))
  // Successful sign-in → land on /admin/artists for now. Phase 7 will
  // route to /account for non-admin users.
  return NextResponse.redirect(new URL('/admin/artists', request.url))
}
