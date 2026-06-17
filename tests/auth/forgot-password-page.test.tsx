import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequestPasswordReset = vi.fn()
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    requestPasswordReset: (...a: unknown[]) => mockRequestPasswordReset(...a)
  }
}))

beforeEach(() => {
  mockRequestPasswordReset.mockReset()
})

async function fillAndSubmit(email = 'a@b.com') {
  const { default: ForgotPasswordPage } = await import('@/app/forgot-password/page')
  render(<ForgotPasswordPage />)
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: email } })
  fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))
}

describe('forgot-password page', () => {
  it('calls requestPasswordReset with the email + a redirectTo of /reset-password', async () => {
    mockRequestPasswordReset.mockResolvedValue({ data: { status: true }, error: null })
    await fillAndSubmit()
    await waitFor(() =>
      expect(mockRequestPasswordReset).toHaveBeenCalledWith({
        email: 'a@b.com',
        redirectTo: '/reset-password'
      })
    )
  })

  it('shows the generic success message after a successful request', async () => {
    mockRequestPasswordReset.mockResolvedValue({ data: { status: true }, error: null })
    await fillAndSubmit()
    expect(await screen.findByRole('status')).toHaveTextContent(/if an account exists/i)
  })

  it('still shows the generic success message when the API returns an error (anti-enumeration)', async () => {
    mockRequestPasswordReset.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await fillAndSubmit()
    expect(await screen.findByRole('status')).toHaveTextContent(/if an account exists/i)
    // The raw error must never surface to the user.
    expect(screen.queryByText(/boom/i)).toBeNull()
  })

  it('disables the submit button while the request is in flight', async () => {
    let resolve: (v: unknown) => void = () => {}
    mockRequestPasswordReset.mockReturnValue(
      new Promise((r) => {
        resolve = r
      })
    )
    await fillAndSubmit()
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled()
    resolve({ data: { status: true }, error: null })
    await screen.findByRole('status')
  })

  it('links back to /sign-in', async () => {
    const { default: ForgotPasswordPage } = await import('@/app/forgot-password/page')
    render(<ForgotPasswordPage />)
    const link = screen.getByRole('link', { name: /back to sign in/i })
    expect(link).toHaveAttribute('href', '/sign-in')
  })
})
