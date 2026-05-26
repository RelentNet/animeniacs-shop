import Link from 'next/link'
import { NewsletterSignupStub } from './NewsletterSignupStub'

export function Footer() {
  return (
    <footer className="mt-16 border-t border-gray-200 bg-gray-50 text-gray-700">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-4">
        <section aria-labelledby="footer-help">
          <h2 id="footer-help" className="text-sm font-semibold uppercase text-gray-900">
            Need Help
          </h2>
          <ul className="mt-3 space-y-1 text-sm">
            <li>
              <Link href="/how-to-display-our-art">How to Display Your Art</Link>
            </li>
            <li>
              <Link href="/faqs">FAQs</Link>
            </li>
            <li>
              <Link href="/contact-us">Contact Us</Link>
            </li>
          </ul>
        </section>

        <section aria-labelledby="footer-follow">
          <h2 id="footer-follow" className="text-sm font-semibold uppercase text-gray-900">
            Follow Us
          </h2>
          <ul className="mt-3 space-y-1 text-sm">
            <li>
              <a href="https://instagram.com/animeniacs.shop" target="_blank" rel="noreferrer">
                Instagram
              </a>
            </li>
            <li>
              <a href="https://facebook.com/Animeniacs.shop" target="_blank" rel="noreferrer">
                Facebook
              </a>
            </li>
            <li>
              <Link href="/twitch">Twitch</Link>
            </li>
            <li>
              <a href="https://discord.gg/VAwd8sJp" target="_blank" rel="noreferrer">
                Discord
              </a>
            </li>
          </ul>
        </section>

        <section aria-labelledby="footer-partner">
          <h2 id="footer-partner" className="text-sm font-semibold uppercase text-gray-900">
            Partner with Us
          </h2>
          <ul className="mt-3 space-y-1 text-sm">
            <li>
              <Link href="/partner-with-us">Partner with Us</Link>
            </li>
            <li>
              <a href="https://affiliates.animeniacs.shop" target="_blank" rel="noreferrer">
                Become an Artist
              </a>
            </li>
            <li>
              <Link href="/b2b">B2B</Link>
            </li>
            <li>
              <a
                href="https://affiliates.animeniacs.shop/program-legal/terms"
                target="_blank"
                rel="noreferrer"
              >
                Artist Agreement
              </a>
            </li>
            <li>
              <Link href="/careers">Careers</Link>
            </li>
          </ul>
        </section>

        <section aria-labelledby="footer-info">
          <h2 id="footer-info" className="text-sm font-semibold uppercase text-gray-900">
            Info
          </h2>
          <ul className="mt-3 space-y-1 text-sm">
            <li>
              <Link href="/about-us">About Us</Link>
            </li>
            <li>
              <Link href="/terms-of-service">Terms of Service</Link>
            </li>
            <li>
              <Link href="/privacy-policy">Privacy Policy</Link>
            </li>
            <li>
              <Link href="/shipping-policy">Shipping Policy</Link>
            </li>
            <li>
              <Link href="/refund-return-policy">Refund & Return Policy</Link>
            </li>
          </ul>
        </section>
      </div>

      <div className="border-t border-gray-200">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 py-6 text-sm md:flex-row md:items-center">
          <NewsletterSignupStub />
          <p>© {new Date().getFullYear()} Animeniacs</p>
        </div>
      </div>
    </footer>
  )
}
