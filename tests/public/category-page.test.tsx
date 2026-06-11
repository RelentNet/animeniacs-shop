import CategoryPage from '@/app/category/[slug]/page'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

const { mockGetBySlug, mockGetProducts, mockGetCategoryNameMap, mockGetSummaries, mockNotFound } =
  vi.hoisted(() => ({
    mockGetBySlug: vi.fn(),
    mockGetProducts: vi.fn(),
    mockGetCategoryNameMap: vi.fn(),
    mockGetSummaries: vi.fn(() => Promise.resolve(new Map())),
    mockNotFound: vi.fn(() => {
      throw new Error('NEXT_NOT_FOUND')
    })
  }))

vi.mock('@/lib/db/queries/ip-nicknames', () => ({ getIpNicknameBySlug: mockGetBySlug }))
vi.mock('@/lib/categories', () => ({ getProductsForIpNickname: mockGetProducts }))
vi.mock('@/lib/square/categories', () => ({ getCategoryNameMap: mockGetCategoryNameMap }))
vi.mock('@/lib/db/queries/reviews', () => ({
  getReviewSummariesForProducts: mockGetSummaries
}))
vi.mock('next/navigation', () => ({ notFound: mockNotFound }))
vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />
}))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href as string}>{children}</a>
  )
}))

function nickname(overrides: Record<string, unknown> = {}) {
  return {
    id: 'N1',
    slug: 'ramen-shop',
    nickname: 'Ramen Shop',
    squareCategoryId: 'CAT_NARUTO',
    description: 'Drops featuring ramen.',
    coverImageUrl: null,
    isPublic: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }
}

describe('CategoryPage', () => {
  it('renders H1 = nickname and description', async () => {
    mockGetBySlug.mockResolvedValueOnce(nickname())
    mockGetProducts.mockResolvedValueOnce([])
    mockGetCategoryNameMap.mockResolvedValueOnce(new Map([['CAT_NARUTO', 'Anime > Naruto']]))
    const ui = await CategoryPage({ params: { slug: 'ramen-shop' } })
    render(ui)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ramen Shop')
    expect(screen.getByTestId('ip-description')).toHaveTextContent(/drops featuring ramen/i)
  })

  it('REGRESSION GUARD: never renders the literal Square category name', async () => {
    mockGetBySlug.mockResolvedValueOnce(nickname())
    mockGetProducts.mockResolvedValueOnce([])
    mockGetCategoryNameMap.mockResolvedValueOnce(new Map([['CAT_NARUTO', 'Anime > Naruto']]))
    const ui = await CategoryPage({ params: { slug: 'ramen-shop' } })
    const { container } = render(ui)
    // The Square category name "Anime > Naruto" must NEVER appear in the DOM
    // on this public page. This is the canary for the IP-never-public constraint.
    expect(container.textContent).not.toMatch(/Anime/i)
    expect(container.textContent).not.toMatch(/Naruto/i)
  })

  it('renders product grid with PDP links when products exist', async () => {
    mockGetBySlug.mockResolvedValueOnce(nickname())
    mockGetProducts.mockResolvedValueOnce([
      {
        id: 'P1',
        name: 'Print A',
        imageUrl: 'https://example.com/a.jpg',
        priceCents: 2500,
        categoryIds: []
      },
      {
        id: 'P2',
        name: 'Print B',
        imageUrl: null,
        priceCents: null,
        categoryIds: []
      }
    ])
    mockGetCategoryNameMap.mockResolvedValueOnce(new Map())
    const ui = await CategoryPage({ params: { slug: 'ramen-shop' } })
    render(ui)
    const link1 = screen.getByRole('link', { name: /print a/i })
    expect(link1).toHaveAttribute('href', '/product/P1')
    expect(screen.getByText('Print B')).toBeInTheDocument()
  })

  it('renders star ratings on cards when summaries are present', async () => {
    mockGetBySlug.mockResolvedValueOnce(nickname())
    mockGetProducts.mockResolvedValueOnce([
      { id: 'P1', name: 'Print A', imageUrl: null, priceCents: 2500, categoryIds: [], updatedAt: null }
    ])
    mockGetCategoryNameMap.mockResolvedValueOnce(new Map())
    mockGetSummaries.mockResolvedValueOnce(new Map([['P1', { count: 2, average: 5 }]]))
    const ui = await CategoryPage({ params: { slug: 'ramen-shop' } })
    render(ui)
    expect(screen.getByRole('img', { name: /5\.0 out of 5 stars/i })).toBeInTheDocument()
  })

  it('shows empty state when no products', async () => {
    mockGetBySlug.mockResolvedValueOnce(nickname())
    mockGetProducts.mockResolvedValueOnce([])
    mockGetCategoryNameMap.mockResolvedValueOnce(new Map())
    const ui = await CategoryPage({ params: { slug: 'ramen-shop' } })
    render(ui)
    expect(screen.getByText(/no drops featuring ramen shop/i)).toBeInTheDocument()
  })

  it('calls notFound() when nickname missing', async () => {
    mockGetBySlug.mockResolvedValueOnce(undefined)
    await expect(CategoryPage({ params: { slug: 'missing' } })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('calls notFound() when nickname is_public=false', async () => {
    mockGetBySlug.mockResolvedValueOnce(nickname({ isPublic: false }))
    await expect(CategoryPage({ params: { slug: 'hidden' } })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('omits description section when description is null', async () => {
    mockGetBySlug.mockResolvedValueOnce(nickname({ description: null }))
    mockGetProducts.mockResolvedValueOnce([])
    mockGetCategoryNameMap.mockResolvedValueOnce(new Map())
    const ui = await CategoryPage({ params: { slug: 'ramen-shop' } })
    const { container } = render(ui)
    expect(container.querySelector('[data-testid="ip-description"]')).toBeNull()
  })
})
