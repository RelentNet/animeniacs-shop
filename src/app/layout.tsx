import { CartProvider } from '@/components/cart/CartProvider'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { PromoBar } from '@/components/layout/PromoBar'
import type { Metadata } from 'next'
import { Bebas_Neue, Space_Grotesk, Space_Mono } from 'next/font/google'
import './globals.css'

// Street-poster display face for headlines, a clean grotesk for body/UI, and
// a mono "HUD" face for eyebrows/tech labels. Exposed as CSS vars and consumed
// by the @theme tokens in globals.css.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk'
})
const bebas = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-bebas'
})
const spaceMono = Space_Mono({
  weight: ['400', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-mono'
})

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
    <html lang="en" className={`${spaceGrotesk.variable} ${bebas.variable} ${spaceMono.variable}`}>
      <body className="flex min-h-screen flex-col bg-ink text-bone">
        <a
          href="#content"
          className="sr-only z-[100] focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded focus:bg-neon focus:px-4 focus:py-2 focus:font-bold focus:text-ink focus:no-underline"
        >
          Skip to content
        </a>
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
