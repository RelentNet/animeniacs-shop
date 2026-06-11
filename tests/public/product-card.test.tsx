import { ProductCard } from '@/components/product/ProductCard'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />
}))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href as string}>{children}</a>
  )
}))

const base = {
  id: 'P1',
  name: 'Print A',
  imageUrl: 'https://x/a.jpg',
  priceCents: 2500,
  categoryIds: [],
  updatedAt: null
}

describe('ProductCard', () => {
  it('links to the PDP and renders name + formatted price', () => {
    render(<ProductCard product={base} />)
    const link = screen.getByRole('link', { name: /print a/i })
    expect(link).toHaveAttribute('href', '/product/P1')
    expect(screen.getByText('$25.00')).toBeInTheDocument()
  })

  it('renders the No image placeholder when imageUrl is null', () => {
    render(<ProductCard product={{ ...base, imageUrl: null }} />)
    expect(screen.getByText(/no image/i)).toBeInTheDocument()
  })

  it('renders an em dash when priceCents is null', () => {
    render(<ProductCard product={{ ...base, priceCents: null }} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders StarRating + count when rating present and count > 0', () => {
    render(<ProductCard product={base} rating={{ count: 2, average: 4.5 }} />)
    expect(screen.getByRole('img', { name: /4\.5 out of 5 stars/i })).toBeInTheDocument()
    expect(screen.getByText('(2)')).toBeInTheDocument()
  })

  it('omits the rating when no rating prop is supplied', () => {
    render(<ProductCard product={base} />)
    expect(screen.queryByRole('img', { name: /out of 5 stars/i })).toBeNull()
  })

  it('omits the rating when count is 0', () => {
    render(<ProductCard product={base} rating={{ count: 0, average: 0 }} />)
    expect(screen.queryByRole('img', { name: /out of 5 stars/i })).toBeNull()
  })

  it('REGRESSION: never renders a category name/id even when categoryIds present', () => {
    const { container } = render(
      <ProductCard product={{ ...base, categoryIds: ['CAT_NARUTO'] }} />
    )
    expect(container.textContent).not.toMatch(/CAT_/i)
    expect(container.textContent).not.toMatch(/Naruto/i)
  })
})
