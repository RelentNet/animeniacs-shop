import ProductDetailPage from '@/app/product/[id]/page'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

const { mockGetProductById, mockGetRelated, mockNotFound } = vi.hoisted(() => ({
  mockGetProductById: vi.fn(),
  mockGetRelated: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  })
}))

vi.mock('@/lib/products/cache', () => ({ getProductById: mockGetProductById }))
vi.mock('@/lib/categories/related', () => ({ getRelatedProducts: mockGetRelated }))
vi.mock('next/navigation', () => ({ notFound: mockNotFound }))
vi.mock('@/components/product/ArtistMetaLine', () => ({
  ArtistMetaLine: ({ categoryIds }: { categoryIds: string[] }) => (
    <div data-testid="artist-meta" data-cats={categoryIds.join(',')} />
  )
}))
vi.mock('@/components/product/MockupGallery', () => ({
  MockupGallery: () => <div data-testid="mockup-gallery" />
}))
vi.mock('@/components/product/PdpPurchasePanel', () => ({
  PdpPurchasePanel: () => <div data-testid="pdp-panel" />
}))
// Phase 12: the PDP gained a reviews section + wishlist button. Stub the
// reviews server component and the wishlist button, and the request-time
// reads they trigger, so this rendering test stays focused on layout.
vi.mock('@/components/product/ProductReviews', () => ({
  ProductReviews: () => <div data-testid="product-reviews" />
}))
vi.mock('@/components/product/WishlistButton', () => ({
  WishlistButton: () => <div data-testid="wishlist-button" />
}))
vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: vi.fn(async () => ({
    isAuthenticated: false,
    userId: null,
    email: null,
    name: null,
    roles: []
  }))
}))
vi.mock('@/lib/db/queries/wishlists', () => ({ isInWishlist: vi.fn(async () => false) }))
vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />
}))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href as string}>{children}</a>
  )
}))

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 'P1',
    name: 'Cool Print',
    description: null,
    descriptionHtml: '<p>Nice <strong>print</strong></p>',
    variations: [],
    images: ['https://example.com/img.jpg'],
    categoryIds: ['ART_CAT', 'IP_CAT'],
    itemOptions: [],
    updatedAt: '2026-05-22T00:00:00Z',
    ...overrides
  }
}

describe('ProductDetailPage', () => {
  it('renders H1 + breadcrumbs exactly "Home / {name}" (no IP segment)', async () => {
    mockGetProductById.mockResolvedValueOnce(product())
    mockGetRelated.mockResolvedValueOnce({ items: [], source: null })
    const ui = await ProductDetailPage({ params: { id: 'P1' } })
    render(ui)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cool Print')
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i })
    expect(nav.textContent).toMatch(/^Home\s*\/\s*Cool Print\s*$/)
    // IP-leak regression guard: the literal Square category id / IP names
    // must not be in the page.
    expect(nav.textContent).not.toMatch(/IP_CAT|ART_CAT/i)
  })

  it('passes categoryIds to <ArtistMetaLine>', async () => {
    mockGetProductById.mockResolvedValueOnce(product())
    mockGetRelated.mockResolvedValueOnce({ items: [], source: null })
    const ui = await ProductDetailPage({ params: { id: 'P1' } })
    render(ui)
    expect(screen.getByTestId('artist-meta')).toHaveAttribute('data-cats', 'ART_CAT,IP_CAT')
  })

  it('omits the description section when descriptionHtml is null', async () => {
    mockGetProductById.mockResolvedValueOnce(product({ descriptionHtml: null }))
    mockGetRelated.mockResolvedValueOnce({ items: [], source: null })
    const ui = await ProductDetailPage({ params: { id: 'P1' } })
    render(ui)
    expect(screen.queryByRole('heading', { name: /description/i })).toBeNull()
  })

  it('omits the related section when source is null', async () => {
    mockGetProductById.mockResolvedValueOnce(product())
    mockGetRelated.mockResolvedValueOnce({ items: [], source: null })
    const ui = await ProductDetailPage({ params: { id: 'P1' } })
    render(ui)
    expect(screen.queryByRole('heading', { name: /more from/i })).toBeNull()
  })

  it('renders related section with artist label when source.kind === "artist"', async () => {
    mockGetProductById.mockResolvedValueOnce(product())
    mockGetRelated.mockResolvedValueOnce({
      items: [{ id: 'X', name: 'Other', imageUrl: null, priceCents: 100, categoryIds: [] }],
      source: { kind: 'artist', slug: 'noah', displayName: 'Noah' }
    })
    const ui = await ProductDetailPage({ params: { id: 'P1' } })
    render(ui)
    expect(screen.getByRole('heading', { name: /more from noah/i })).toBeInTheDocument()
  })

  it('renders related section with nickname label when source.kind === "ip"', async () => {
    mockGetProductById.mockResolvedValueOnce(product())
    mockGetRelated.mockResolvedValueOnce({
      items: [{ id: 'X', name: 'Other', imageUrl: null, priceCents: 100, categoryIds: [] }],
      source: { kind: 'ip', slug: 'ramen-shop', nickname: 'Ramen Shop' }
    })
    const ui = await ProductDetailPage({ params: { id: 'P1' } })
    render(ui)
    expect(screen.getByRole('heading', { name: /more from ramen shop/i })).toBeInTheDocument()
  })

  it('calls notFound() when product is null', async () => {
    mockGetProductById.mockResolvedValueOnce(null)
    await expect(ProductDetailPage({ params: { id: 'MISSING' } })).rejects.toThrow(
      'NEXT_NOT_FOUND'
    )
  })
})
