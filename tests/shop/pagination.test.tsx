import { Pagination } from '@/components/shop/Pagination'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href as string} {...rest}>
      {children}
    </a>
  )
}))

describe('Pagination', () => {
  it('builds numbered hrefs that preserve other params and change only page', () => {
    render(<Pagination page={2} pageCount={3} params={{ q: 'cat', sort: 'rating' }} />)
    const page3 = screen.getByRole('link', { name: '3' })
    const href = page3.getAttribute('href') ?? ''
    expect(href).toContain('q=cat')
    expect(href).toContain('sort=rating')
    expect(href).toContain('page=3')
  })

  it('renders prev + next links on a middle page', () => {
    render(<Pagination page={2} pageCount={3} params={{}} />)
    expect(screen.getByRole('link', { name: /previous/i })).toHaveAttribute('href', '/shop?page=1')
    expect(screen.getByRole('link', { name: /next/i })).toHaveAttribute('href', '/shop?page=3')
  })

  it('disables prev on page 1 (no prev link)', () => {
    render(<Pagination page={1} pageCount={3} params={{}} />)
    expect(screen.queryByRole('link', { name: /previous/i })).toBeNull()
    expect(screen.getByRole('link', { name: /next/i })).toBeInTheDocument()
  })

  it('disables next on the last page (no next link)', () => {
    render(<Pagination page={3} pageCount={3} params={{}} />)
    expect(screen.queryByRole('link', { name: /next/i })).toBeNull()
    expect(screen.getByRole('link', { name: /previous/i })).toBeInTheDocument()
  })

  it('renders nothing when there is only one page', () => {
    const { container } = render(<Pagination page={1} pageCount={1} params={{}} />)
    expect(container.querySelector('a')).toBeNull()
  })
})
