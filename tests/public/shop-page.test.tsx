import ShopPage from '@/app/shop/page'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

const { mockGetShopProducts, mockGetPublicIpNicknames } = vi.hoisted(() => ({
  mockGetShopProducts: vi.fn(),
  mockGetPublicIpNicknames: vi.fn()
}))

vi.mock('@/lib/square/items', () => ({ getShopProducts: mockGetShopProducts }))
vi.mock('@/lib/db/queries/ip-nicknames', () => ({
  getPublicIpNicknames: mockGetPublicIpNicknames
}))
vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />
}))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href as string}>{children}</a>
  )
}))

function product(id: string, name: string, categoryIds: string[] = []) {
  return { id, name, imageUrl: null, priceCents: 2500, categoryIds }
}
function nick(slug: string, nickname: string) {
  return {
    id: `N-${slug}`,
    slug,
    nickname,
    squareCategoryId: 'CAT_X',
    description: null,
    coverImageUrl: null,
    isPublic: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }
}

describe('ShopPage', () => {
  it('renders a grid of PDP links for returned products', async () => {
    mockGetShopProducts.mockResolvedValueOnce([product('P1', 'Print A'), product('P2', 'Print B')])
    mockGetPublicIpNicknames.mockResolvedValueOnce([])
    render(await ShopPage())
    expect(screen.getByRole('link', { name: /print a/i })).toHaveAttribute('href', '/product/P1')
    expect(screen.getByRole('link', { name: /print b/i })).toHaveAttribute('href', '/product/P2')
  })

  it('renders IP-nickname chips linking to /category/<slug>', async () => {
    mockGetShopProducts.mockResolvedValueOnce([product('P1', 'Print A')])
    mockGetPublicIpNicknames.mockResolvedValueOnce([nick('ramen-shop', 'Ramen Shop')])
    render(await ShopPage())
    const chip = screen.getByRole('link', { name: 'Ramen Shop' })
    expect(chip).toHaveAttribute('href', '/category/ramen-shop')
  })

  it('omits the chip row when there are no public nicknames', async () => {
    mockGetShopProducts.mockResolvedValueOnce([product('P1', 'Print A')])
    mockGetPublicIpNicknames.mockResolvedValueOnce([])
    const { container } = render(await ShopPage())
    expect(container.querySelector('[data-testid="ip-chips"]')).toBeNull()
  })

  it('shows the empty state when no products', async () => {
    mockGetShopProducts.mockResolvedValueOnce([])
    mockGetPublicIpNicknames.mockResolvedValueOnce([])
    render(await ShopPage())
    expect(screen.getByText(/no products available yet/i)).toBeInTheDocument()
  })

  it('REGRESSION GUARD: never renders a raw Square category name', async () => {
    // products carry IP category IDs; the page must not surface any name.
    mockGetShopProducts.mockResolvedValueOnce([product('P1', 'Print A', ['CAT_NARUTO'])])
    mockGetPublicIpNicknames.mockResolvedValueOnce([nick('ramen-shop', 'Ramen Shop')])
    const { container } = render(await ShopPage())
    expect(container.textContent).not.toMatch(/Anime/i)
    expect(container.textContent).not.toMatch(/Naruto/i)
    expect(container.textContent).not.toMatch(/CAT_/i)
  })
})
