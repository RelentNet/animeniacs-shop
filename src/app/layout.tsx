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
 * The root layout renders <PromoBar />, which reads the `promo_bar`
 * setting from Postgres. That read must happen at request time, not during
 * the production build: the Docker builder cannot resolve the database host,
 * so prerendering any page that uses this layout (i.e. every page) throws
 * `ENOTFOUND` and fails `pnpm build`. Forcing dynamic rendering here opts the
 * whole tree out of build-time static generation, which is the sanctioned fix
 * per the Phase 9 plan ("do NOT add force-dynamic to the root layout unless
 * the build fails specifically on it" — it does).
 */
export const dynamic = 'force-dynamic'

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
