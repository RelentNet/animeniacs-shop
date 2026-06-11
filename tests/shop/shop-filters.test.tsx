import { ShopFilters } from '@/components/shop/ShopFilters'
import type { ShopQuery } from '@/lib/shop/parse-params'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

const baseQuery: ShopQuery = {
  q: null,
  categorySlug: null,
  artistSlug: null,
  categoryId: null,
  artistCategoryId: null,
  minCents: null,
  maxCents: null,
  sort: null,
  page: 1
}

const categories = [
  { slug: 'naruto', label: 'Naruto' },
  { slug: 'one-piece', label: 'One Piece' }
]
const artists = [
  { slug: 'merc', label: 'Merc' },
  { slug: 'saru', label: 'Saru' }
]

function renderFilters(query: ShopQuery = baseQuery) {
  return render(<ShopFilters categories={categories} artists={artists} query={query} />)
}

describe('ShopFilters', () => {
  it('renders a GET form targeting /shop', () => {
    const { container } = renderFilters()
    const form = container.querySelector('form')
    expect(form).not.toBeNull()
    expect(form?.getAttribute('method')?.toLowerCase()).toBe('get')
    expect(form?.getAttribute('action')).toBe('/shop')
  })

  it('renders the category options from the passed list', () => {
    renderFilters()
    const select = screen.getByLabelText(/series/i)
    expect(select).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Naruto' })).toHaveValue('naruto')
    expect(screen.getByRole('option', { name: 'One Piece' })).toHaveValue('one-piece')
  })

  it('renders the artist options from the passed list', () => {
    renderFilters()
    expect(screen.getByLabelText(/artist/i)).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Merc' })).toHaveValue('merc')
  })

  it('pre-selects the current query values', () => {
    renderFilters({
      ...baseQuery,
      q: 'poster',
      categorySlug: 'one-piece',
      artistSlug: 'saru',
      minCents: 1000,
      maxCents: 5000,
      sort: 'price_asc'
    })
    expect(screen.getByLabelText(/search/i)).toHaveValue('poster')
    expect(screen.getByLabelText(/series/i)).toHaveValue('one-piece')
    expect(screen.getByLabelText(/artist/i)).toHaveValue('saru')
    expect(screen.getByLabelText(/min/i)).toHaveValue(10)
    expect(screen.getByLabelText(/max/i)).toHaveValue(50)
    expect(screen.getByLabelText(/sort/i)).toHaveValue('price_asc')
  })

  it('defaults selects to the empty (All) option when no query value', () => {
    renderFilters()
    expect(screen.getByLabelText(/series/i)).toHaveValue('')
    expect(screen.getByLabelText(/artist/i)).toHaveValue('')
    expect(screen.getByLabelText(/sort/i)).toHaveValue('')
    expect(screen.getByLabelText(/search/i)).toHaveValue('')
  })
})
