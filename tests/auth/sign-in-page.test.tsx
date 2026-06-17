import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSignInEmail = vi.fn()
vi.mock('@/lib/auth-client', () => ({
  authClient: { signIn: { email: (...a: unknown[]) => mockSignInEmail(...a) } }
}))

beforeEach(() => {
  mockSignInEmail.mockReset()
})

async function fillAndSubmit() {
  const { default: SignInPage } = await import('@/app/sign-in/page')
  render(<SignInPage />)
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } })
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'hunter2pw' } })
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
}

describe('sign-in page', () => {
  it('submits email + password to authClient.signIn.email', async () => {
    // Resolve with an error so the success path doesn't navigate (jsdom).
    mockSignInEmail.mockResolvedValue({ data: null, error: { message: 'nope' } })
    await fillAndSubmit()
    await waitFor(() =>
      expect(mockSignInEmail).toHaveBeenCalledWith({ email: 'a@b.com', password: 'hunter2pw' })
    )
  })

  it('shows an inline error when sign-in fails', async () => {
    mockSignInEmail.mockResolvedValue({ data: null, error: { message: 'Invalid credentials' } })
    await fillAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid credentials/i)
  })

  it('links to /forgot-password', async () => {
    const { default: SignInPage } = await import('@/app/sign-in/page')
    render(<SignInPage />)
    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute(
      'href',
      '/forgot-password'
    )
  })
})
