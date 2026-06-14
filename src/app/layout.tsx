import { CartProvider } from '@/components/cart/CartProvider'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { PromoBar } from '@/components/layout/PromoBar'
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Animeniacs',
  description: 'Fandom at its best — anime art, gaming gear, and more.'
}

/**
 * No `force-dynamic` here (Phase 16, spec §4). The root layout renders
 * <PromoBar />, which reads the `promo_bar` setting from Postgres — but build
 * tolerance now lives in the data layer (`getSetting` returns null during
 * `next build`, see src/lib/db/queries/site-settings.ts), so the Docker
 * builder no longer hits ENOTFOUND. Keeping the tree dynamic would defeat the
 * whole caching pass; genuinely per-request routes opt into dynamic rendering
 * themselves (cookies/searchParams) or carry their own explicit export.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <CartProvider>
          <PromoBar />
          <Header />
          <main id="content" className="flex-1">
            {children}
          </main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  )
}
