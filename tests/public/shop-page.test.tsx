import ShopPage from '@/app/shop/page'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

const {
  mockGetShopProducts,
  mockGetPublicIpNicknames,
  mockGetActiveArtists,
  mockGetReviewSummariesForProducts
} = vi.hoisted(() => ({
  mockGetShopProducts: vi.fn(),
  mockGetPublicIpNicknames: vi.fn(),
  mockGetActiveArtists: vi.fn(),
  mockGetReviewSummariesForProducts: vi.fn()
}))

vi.mock('@/lib/square/items', () => ({ getShopProducts: mockGetShopProducts }))
vi.mock('@/lib/db/queries/ip-nicknames', () => ({
  getPublicIpNicknames: mockGetPublicIpNicknames
}))
vi.mock('@/lib/db/queries/artists', () => ({ getActiveArtists: mockGetActiveArtists }))
vi.mock('@/lib/db/queries/reviews', () => ({
  getReviewSummariesForProducts: mockGetReviewSummariesForProducts
}))
vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />
}))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href as string}>{children}</a>
  )
}))

function product(id: string, name: string, over: Record<string, unknown> = {}) {
  return {
    id,
    name,
    imageUrl: null,
    priceCents: 2500,
    categoryIds: [],
    updatedAt: null,
    ...over
  }
}
function nick(slug: string, nickname: string, squareCategoryId = 'CAT_X') {
  return {
    id: `N-${slug}`,
    slug,
    nickname,
    squareCategoryId,
    description: null,
    coverImageUrl: null,
    isPublic: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }
}
function artist(slug: string, displayName: string, squareCategoryId = 'CAT_ART') {
  return { id: `A-${slug}`, slug, displayName, squareCategoryId, status: 'active' }
}

function setup({
  products = [product('P1', 'Print A')],
  nicknames = [] as ReturnType<typeof nick>[],
  artists = [] as ReturnType<typeof artist>[],
  summaries = new Map()
} = {}) {
  mockGetShopProducts.mockResolvedValue(products)
  mockGetPublicIpNicknames.mockResolvedValue(nicknames)
  mockGetActiveArtists.mockResolvedValue(artists)
  mockGetReviewSummariesForProducts.mockResolvedValue(summaries)
}

async function renderShop(searchParams: Record<string, string | string[] | undefined> = {}) {
  return render(await ShopPage({ searchParams }))
}

describe('ShopPage', () => {
  it('renders a grid of PDP links for returned products', async () => {
    setup({ products: [product('P1', 'Print A'), product('P2', 'Print B')] })
    await renderShop()
    expect(screen.getByRole('link', { name: /print a/i })).toHaveAttribute('href', '/product/P1')
    expect(screen.getByRole('link', { name: /print b/i })).toHaveAttribute('href', '/product/P2')
  })

  it('?q= narrows the grid by name', async () => {
    setup({ products: [product('P1', 'Naruto Poster'), product('P2', 'Goku Mug')] })
    await renderShop({ q: 'naruto' })
    expect(screen.getByRole('link', { name: /naruto poster/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /goku mug/i })).toBeNull()
  })

  it('?sort=price_asc orders the grid by price ascending', async () => {
    setup({
      products: [
        product('hi', 'Expensive', { priceCents: 9000 }),
        product('lo', 'Cheap', { priceCents: 500 })
      ]
    })
    const { container } = await renderShop({ sort: 'price_asc' })
    const names = [...container.querySelectorAll('li .font-medium')].map((n) => n.textContent)
    expect(names).toEqual(['Cheap', 'Expensive'])
  })

  it('?page=2 shows the second window of results', async () => {
    const products = Array.from({ length: 30 }, (_, i) =>
      product(`P${i}`, `Item ${String(i).padStart(2, '0')}`)
    )
    setup({ products })
    await renderShop({ page: '2' })
    // page size 24 → page 2 holds items 24..29
    expect(screen.getByRole('link', { name: /item 24/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /item 00/i })).toBeNull()
  })

  it('renders filters, and cards get ratings from the batch summary', async () => {
    setup({
      products: [product('P1', 'Print A')],
      summaries: new Map([['P1', { count: 3, average: 4.0 }]])
    })
    const { container } = await renderShop()
    expect(container.querySelector('form[action="/shop"]')).not.toBeNull()
    expect(screen.getByRole('img', { name: /4\.0 out of 5 stars/i })).toBeInTheDocument()
  })

  it('shows the empty state when no products', async () => {
    setup({ products: [] })
    await renderShop()
    expect(screen.getByText(/no products/i)).toBeInTheDocument()
  })

  it('REGRESSION GUARD: never renders a raw Square category name or CAT_ id', async () => {
    setup({
      products: [product('P1', 'Print A', { categoryIds: ['CAT_NARUTO'] })],
      nicknames: [nick('ramen-shop', 'Ramen Shop', 'CAT_NARUTO')]
    })
    const { container } = await renderShop()
    expect(container.textContent).not.toMatch(/CAT_/i)
    // the raw Square category token must not leak; the public nickname is fine
    expect(container.textContent).not.toMatch(/Naruto/i)
  })
})
