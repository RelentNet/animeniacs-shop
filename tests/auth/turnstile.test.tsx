import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-client', () => ({ authClient: {} }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function pluginIds(secret: string) {
  vi.stubEnv('TURNSTILE_SECRET_KEY', secret)
  vi.resetModules()
  const { auth } = await import('@/lib/auth')
  return (auth.options.plugins ?? []).map((p) => p.id)
}

describe('captcha plugin registration', () => {
  it('is registered only when TURNSTILE_SECRET_KEY is set', async () => {
    expect(await pluginIds('1x0000000000000000000000000000000AA')).toContain('captcha')
    expect(await pluginIds('')).not.toContain('captcha')
  })
})

describe('auth forms', () => {
  it('render the widget only with a site key', async () => {
    const { SignInForm } = await import('@/components/auth/SignInForm')
    const { SignUpForm } = await import('@/components/auth/SignUpForm')
    const { ForgotPasswordForm } = await import('@/components/auth/ForgotPasswordForm')
    for (const Form of [SignInForm, SignUpForm, ForgotPasswordForm]) {
      const { unmount } = render(<Form />)
      expect(screen.queryByTestId('turnstile')).toBeNull()
      unmount()
      const r = render(<Form siteKey="1x00000000000000000000AA" />)
      expect(screen.getByTestId('turnstile')).toBeInTheDocument()
      r.unmount()
    }
  })
})
