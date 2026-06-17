import Link from 'next/link'
import { NewsletterSignupStub } from './NewsletterSignupStub'

const SECTIONS = [
  {
    id: 'footer-help',
    title: 'Need help',
    links: [
      { href: '/how-to-display-our-art', label: 'How to display your art' },
      { href: '/faqs', label: 'FAQs' },
      { href: '/contact-us', label: 'Contact us' }
    ]
  },
  {
    id: 'footer-follow',
    title: 'Follow us',
    links: [
      { href: 'https://instagram.com/animeniacs.shop', label: 'Instagram', external: true },
      { href: 'https://facebook.com/Animeniacs.shop', label: 'Facebook', external: true },
      { href: '/twitch', label: 'Twitch' },
      { href: 'https://discord.gg/VAwd8sJp', label: 'Discord', external: true }
    ]
  },
  {
    id: 'footer-partner',
    title: 'Partner with us',
    links: [
      { href: '/partner-with-us', label: 'Partner with us' },
      { href: 'https://affiliates.animeniacs.shop', label: 'Become an artist', external: true },
      { href: '/b2b', label: 'B2B' },
      { href: '/brand', label: 'Brand kit' },
      {
        href: 'https://affiliates.animeniacs.shop/program-legal/terms',
        label: 'Artist agreement',
        external: true
      },
      { href: '/careers', label: 'Careers' }
    ]
  },
  {
    id: 'footer-info',
    title: 'Info',
    links: [
      { href: '/about-us', label: 'About us' },
      { href: '/terms-of-service', label: 'Terms of service' },
      { href: '/privacy-policy', label: 'Privacy policy' },
      { href: '/shipping-policy', label: 'Shipping policy' },
      { href: '/refund-return-policy', label: 'Refund & return policy' }
    ]
  }
] as const

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line bg-ink-2 text-muted">
      {/* Newsletter band */}
      <div className="speed-lines border-b border-line">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-5 px-4 py-8 md:flex-row md:items-center">
          <div>
            <p className="eyebrow">Join the crew</p>
            <p className="mt-2 max-w-md text-sm text-muted">
              New drops, artist collabs, and street-team perks — straight to your inbox.
            </p>
          </div>
          <NewsletterSignupStub />
        </div>
      </div>

      {/* Link columns */}
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 md:grid-cols-4">
        {SECTIONS.map((section) => (
          <section key={section.id} aria-labelledby={section.id}>
            <h2 id={section.id} className="eyebrow text-purple-soft">
              {section.title}
            </h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {section.links.map((link) => (
                <li key={link.href}>
                  {'external' in link && link.external ? (
                    <a href={link.href} target="_blank" rel="noreferrer" className="link-neon">
                      {link.label}
                    </a>
                  ) : (
                    <Link href={link.href} className="link-neon">
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* Bottom bar */}
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-4 py-6 text-xs md:flex-row md:items-center">
          <span className="font-display text-xl tracking-wide text-bone">
            ANIM<span className="neon-text">É</span>NIACS
          </span>
          <p className="text-faint">
            © {new Date().getFullYear()} Animeniacs — fandom at its best.
          </p>
        </div>
      </div>
    </footer>
  )
}
