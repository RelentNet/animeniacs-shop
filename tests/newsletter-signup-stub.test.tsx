import { NewsletterSignupStub } from '@/components/layout/NewsletterSignupStub'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('NewsletterSignupStub', () => {
  it('renders the email input and Subscribe button initially', () => {
    render(<NewsletterSignupStub />)
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeInTheDocument()
  })

  it('swaps to an acknowledgement on submit', () => {
    render(<NewsletterSignupStub />)
    const input = screen.getByLabelText('Email') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'alice@example.com' } })
    const form = input.closest('form')
    if (!form) throw new Error('expected form to exist')
    fireEvent.submit(form)
    expect(screen.getByText(/watch your inbox for the next drop/i)).toBeInTheDocument()
    // Original form is gone after submit.
    expect(screen.queryByRole('button', { name: 'Subscribe' })).not.toBeInTheDocument()
  })
})
