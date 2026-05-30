import { logtoConfig } from '@/lib/logto'
import { signIn } from '@logto/next/server-actions'
import { redirect } from 'next/navigation'

// Logto's CookieStorage needs the cookie-secret env var at evaluation
// time; that var isn't available during Next.js's build-time prerender
// pass. Forcing dynamic moves evaluation to request time where the
// runtime env is fully populated. Phase 7.5/B.6 fix.
export const dynamic = 'force-dynamic'

/**
 * Sign-in route handler. Initiates the Logto OIDC flow:
 * builds the authorize URL and redirects the browser to Logto's
 * hosted sign-in UI. Logto then bounces back to /api/logto/callback
 * (configured as the redirect URI in the Logto Admin Console).
 *
 * Phase 4 Task B.1's (admin)/layout.tsx gate redirects unauthenticated
 * users here.
 */
export async function GET(): Promise<never> {
  await signIn(logtoConfig)
  // signIn() throws a Next redirect internally; this line is unreachable
  // but TypeScript needs an explicit return path.
  redirect('/')
}
