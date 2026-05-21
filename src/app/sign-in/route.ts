import { logtoConfig } from '@/lib/logto'
import { signIn } from '@logto/next/server-actions'
import { redirect } from 'next/navigation'

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
