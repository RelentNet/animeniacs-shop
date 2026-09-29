import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'
import { env } from '@/lib/env'

// Read at request time (not build) so the Turnstile site key isn't frozen from
// the build environment. Unset key = no widget.
export const dynamic = 'force-dynamic'

export default function ForgotPasswordPage(): JSX.Element {
  return <ForgotPasswordForm siteKey={env.TURNSTILE_SITE_KEY} />
}
