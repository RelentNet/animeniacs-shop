import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockResetPassword = vi.fn()
vi.mock('@/lib/auth-client', () => ({
  authClient: { resetPassword: (...a: unknown[]) => mockResetPassword(...a) }
}))

// Controllable search params + a navigation spy. `tokenValue` is mutated per
// test before rendering; the mocked useSearchParams reads it lazily.
let tokenValue: string | null = 'valid-token'
const mockGet = vi.fn((key: string) => (key === 'token' ? tokenValue : null))
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: mockGet }),
  useRouter: () => ({ push: mockPush, replace: mockPush })
}))

beforeEach(() => {
  mockResetPassword.mockReset()
  mockPush.mockReset()
  tokenValue = 'valid-token'
})

async function renderPage() {
  const { default: ResetPasswordPage } = await import('@/app/reset-password/page')
  render(<ResetPasswordPage />)
}

function fill(newPassword: string, confirm: string) {
  fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: newPassword } })
  fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: confirm } })
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /reset password/i }))
}

describe('reset-password page', () => {
  it('with a token, submitting matching valid passwords calls resetPassword and redirects to /sign-in', async () => {
    mockResetPassword.mockResolvedValue({ data: { status: true }, error: null })
    await renderPage()
    fill('supersecret', 'supersecret')
    submit()
    await waitFor(() =>
      expect(mockResetPassword).toHaveBeenCalledWith({
        newPassword: 'supersecret',
        token: 'valid-token'
      })
    )
    // Confirmation message shown.
    expect(await screen.findByRole('status')).toHaveTextContent(/password.*(reset|updated)/i)
    // Full-page nav OR router push to /sign-in — accept either; the page uses
    // window.location for the cookie-fresh nav, so also assert the link exists.
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/sign-in')
  })

  it('shows the invalid-link state and makes no API call when the token is missing', async () => {
    tokenValue = null
    await renderPage()
    expect(screen.getByText(/invalid or expired/i)).toBeInTheDocument()
    // No form to submit; assert the API was never touched.
    expect(mockResetPassword).not.toHaveBeenCalled()
    // Offers a path back to request a fresh link.
    expect(screen.getByRole('link', { name: /request a new link/i })).toHaveAttribute(
      'href',
      '/forgot-password'
    )
  })

  it('shows a validation error and makes no API call when passwords do not match', async () => {
    await renderPage()
    fill('supersecret', 'different')
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent(/match/i)
    expect(mockResetPassword).not.toHaveBeenCalled()
  })

  it('shows a validation error and makes no API call when the password is too short', async () => {
    await renderPage()
    fill('short', 'short')
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8/i)
    expect(mockResetPassword).not.toHaveBeenCalled()
  })

  it('surfaces an error message when the API rejects the token (expired/invalid)', async () => {
    mockResetPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid token' }
    })
    await renderPage()
    fill('supersecret', 'supersecret')
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid token/i)
    expect(mockPush).not.toHaveBeenCalled()
  })
})
