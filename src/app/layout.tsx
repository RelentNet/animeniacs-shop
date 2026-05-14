import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Animeniacs',
  description: 'Fandom at its best — anime art, gaming gear, and more.'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
