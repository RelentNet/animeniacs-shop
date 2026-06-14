import { describe, expect, it, vi } from 'vitest'

/**
 * Segment-config regression tests (spec §12). Cheap insurance against someone
 * re-adding the blanket `force-dynamic` to the root layout, or flipping a
 * route's rendering mode by accident. We import each touched module and assert
 * its route-segment exports match the Phase 16 decision table (spec §3):
 *
 *   - root layout / : NO `dynamic` export (the tree is no longer force-dynamic;
 *     build tolerance lives in the data layer).
 *   - /orders/lookup : NO `dynamic` export (static; lookup is a server action).
 *   - /shop          : KEEPS `force-dynamic` (branches on searchParams).
 *   - (account)/(admin) layouts : KEEP `force-dynamic` (per-user).
 *
 * Heavy component/data deps are stubbed so importing a page module is a pure
 * read of its exported constants, never a render.
 */

// --- Stubs for transitive imports pulled in by the page/layout modules ---
vi.mock('@/components/cart/CartProvider', () => ({ CartProvider: () => null }))
vi.mock('@/components/layout/Footer', () => ({ Footer: () => null }))
vi.mock('@/components/layout/Header', () => ({ Header: () => null }))
vi.mock('@/components/layout/PromoBar', () => ({ PromoBar: () => null }))
vi.mock('@/app/orders/lookup/LookupForm', () => ({ LookupForm: () => null }))
vi.mock('@/components/product/ProductCard', () => ({ ProductCard: () => null }))
vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: vi.fn(async () => ({
    isAuthenticated: false,
    userId: null,
    email: null,
    name: null,
    roles: []
  }))
}))

describe('route segment config (spec §3 decision table)', () => {
  it('root layout has NO dynamic export (no blanket force-dynamic)', async () => {
    const mod = await import('@/app/layout')
    expect((mod as Record<string, unknown>).dynamic).toBeUndefined()
    expect((mod as Record<string, unknown>).revalidate).toBeUndefined()
  })

  it('/orders/lookup is static — no dynamic export', async () => {
    const mod = await import('@/app/orders/lookup/page')
    expect((mod as Record<string, unknown>).dynamic).toBeUndefined()
  })

  it('/shop KEEPS force-dynamic (branches on searchParams)', async () => {
    const mod = await import('@/app/shop/page')
    expect((mod as Record<string, unknown>).dynamic).toBe('force-dynamic')
  })

  it('(account) layout KEEPS force-dynamic (per-user)', async () => {
    const mod = await import('@/app/(account)/layout')
    expect((mod as Record<string, unknown>).dynamic).toBe('force-dynamic')
  })

  it('(admin) layout KEEPS force-dynamic (per-user)', async () => {
    const mod = await import('@/app/(admin)/layout')
    expect((mod as Record<string, unknown>).dynamic).toBe('force-dynamic')
  })

  it('/artist index is ISR (revalidate=300, no force-dynamic)', async () => {
    const mod = await import('@/app/artist/page')
    expect((mod as Record<string, unknown>).revalidate).toBe(300)
    expect((mod as Record<string, unknown>).dynamic).toBeUndefined()
  })

  it('/artist/[slug] is ISR (revalidate=300, no generateStaticParams)', async () => {
    const mod = await import('@/app/artist/[slug]/page')
    expect((mod as Record<string, unknown>).revalidate).toBe(300)
    // On-demand ISR: the builder must prerender nothing (no build-time DB read).
    expect((mod as Record<string, unknown>).generateStaticParams).toBeUndefined()
  })

  it('/category/[slug] is ISR (revalidate=300, no generateStaticParams)', async () => {
    const mod = await import('@/app/category/[slug]/page')
    expect((mod as Record<string, unknown>).revalidate).toBe(300)
    expect((mod as Record<string, unknown>).generateStaticParams).toBeUndefined()
  })
})
