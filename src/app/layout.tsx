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
