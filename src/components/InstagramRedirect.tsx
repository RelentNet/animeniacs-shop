'use client'

import { useEffect } from 'react'

const IG_URL = 'https://www.instagram.com/animeniacs.shop/'

/**
 * Shared QR/short-link landing for Instagram (used by /qrinsta and /qr1).
 * Renders a real 200 page (no 404 flash) with a visible fallback link, and
 * redirects on top via three layers so it fires no matter what: JS
 * `location.replace`, a `<meta refresh>` for no-JS, and the tappable link.
 */
export function InstagramRedirect(): JSX.Element {
  useEffect(() => {
    window.location.replace(IG_URL)
  }, [])

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-5 px-4 py-20 text-center">
      {/* No-JS / slow-JS auto-redirect. */}
      <meta httpEquiv="refresh" content={`0; url=${IG_URL}`} />
      <p className="eyebrow">Animeniacs</p>
      <h1 className="font-display text-4xl text-bone sm:text-5xl">Taking you to Instagram…</h1>
      <p className="text-muted">If you're not redirected automatically, tap below.</p>
      <a href={IG_URL} className="btn-neon" rel="noopener noreferrer">
        Open @animeniacs.shop
        <span aria-hidden="true"> →</span>
      </a>
    </main>
  )
}
