import { logtoConfig } from '@/lib/logto'
import { handleSignIn } from '@logto/next/server-actions'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Logto OIDC callback handler. Receives the auth code from Logto,
 * exchanges it for tokens via `handleSignIn`, then redirects to the
 * post-login destination.
 *
 * The redirect URI registered with Logto is /callback,
 * so this file lives at the matching path.
 *
 * Post-login destination: /admin/artists for admin users (since they
 * came here through the admin gate). Public users hitting the
 * sign-in route directly would land on /account when that exists.
 *
 * Reverse-proxy note (Phase 7.5/B.8 fix):
 * Behind Traefik/Coolify the inbound request's URL is reconstructed
 * from the internal Host header (e.g. http://10.x.x.x:3000/...), NOT
 * the public domain. The Logto SDK then sends that internal URL as
 * `redirect_uri` to Logto's token endpoint, which fails OIDC's
 * byte-identical match against the registered https://<public>/callback.
 * Result: `callback_uri_verification.redirect_uri_mismatched`.
 *
 * Fix: rebuild the URL with the configured public origin (logtoConfig
 * .baseUrl, which is NEXT_PUBLIC_SITE_URL in this app) before passing
 * to handleSignIn. This is the cross-project "never trust request Host
 * behind a reverse proxy" rule applied to OIDC.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Reconstruct the callback URL using the public origin from
  // logtoConfig.baseUrl, preserving query params from the inbound request.
  const inbound = new URL(request.url)
  const publicCallbackUrl = new URL('/callback', logtoConfig.baseUrl)
  publicCallbackUrl.search = inbound.search

  // handleSignIn finishes the OIDC dance and stores the session cookie.
  await handleSignIn(logtoConfig, publicCallbackUrl)
  // Successful sign-in → land on /admin/artists for now. Phase 7 will
  // route to /account for non-admin users.
  return NextResponse.redirect(new URL('/admin/artists', logtoConfig.baseUrl))
}
