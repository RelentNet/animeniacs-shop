import { env } from '@/lib/env'
import { logtoConfig } from '@/lib/logto'
import { signOut } from '@logto/next/server-actions'
import { redirect } from 'next/navigation'

// Logto's CookieStorage needs the cookie-secret env var at evaluation
// time; that var isn't available during Next.js's build-time prerender
// pass. Forcing dynamic moves evaluation to request time where the
// runtime env is fully populated. Phase 7.5/B.6 fix.
export const dynamic = 'force-dynamic'

/**
 * Sign-out route handler. Clears the local session and bounces to
 * Logto's end-session endpoint, which then redirects back to the site
 * root. The post-logout redirect URI must be registered in the Logto
 * app's Admin Console.
 */
export async function GET(): Promise<never> {
  await signOut(logtoConfig, env.NEXT_PUBLIC_SITE_URL)
  redirect('/')
}
