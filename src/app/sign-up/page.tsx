import { SignUpForm } from '@/components/auth/SignUpForm'
import { env } from '@/lib/env'

// Read at request time (not build) so the Turnstile site key isn't frozen from
// the build environment. Unset key = no widget.
export const dynamic = 'force-dynamic'

export default function SignUpPage(): JSX.Element {
  return <SignUpForm siteKey={env.TURNSTILE_SITE_KEY} />
}
