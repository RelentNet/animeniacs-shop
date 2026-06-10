import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/product/[id]/reviews/actions', () => ({
  submitReviewAction: vi.fn()
}))

// useFormState is undefined under the jsdom/SSR transform; stub it to a
// controllable state (same harness adaptation as the account-page test).
let formState: Record<string, unknown> = {}
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return { ...actual, useFormState: () => [formState, () => {}] }
})

beforeEach(() => {
  formState = {}
})

describe('ReviewForm', () => {
  it('renders the rating, body, and photo inputs', async () => {
    const { ReviewForm } = await import('@/components/product/ReviewForm')
    render(<ReviewForm productId="ITEM_A" />)

    expect(screen.getByLabelText(/your review/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /submit review/i })).toBeInTheDocument()
    // five radio rating inputs
    expect(screen.getAllByRole('radio')).toHaveLength(5)
    // the productId is carried as a hidden field
    const hidden = document.querySelector('input[name="productId"]') as HTMLInputElement
    expect(hidden?.value).toBe('ITEM_A')
  })

  it('shows the pending message when the review is held for moderation', async () => {
    formState = { ok: true, pending: true }
    const { ReviewForm } = await import('@/components/product/ReviewForm')
    render(<ReviewForm productId="ITEM_A" />)

    expect(screen.getByText(/pending approval/i)).toBeInTheDocument()
  })

  it('shows the published message on a successful verified submission', async () => {
    formState = { ok: true, pending: false }
    const { ReviewForm } = await import('@/components/product/ReviewForm')
    render(<ReviewForm productId="ITEM_A" />)

    expect(screen.getByText(/has been published/i)).toBeInTheDocument()
  })

  it('shows a duplicate banner', async () => {
    formState = { error: 'duplicate' }
    const { ReviewForm } = await import('@/components/product/ReviewForm')
    render(<ReviewForm productId="ITEM_A" />)

    expect(screen.getByRole('alert')).toHaveTextContent(/already reviewed/i)
  })
})
