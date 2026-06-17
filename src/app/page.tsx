import { Logo } from '@/components/layout/Logo'
import type { Route } from 'next'
import Link from 'next/link'

export const metadata = {
  title: 'Animeniacs — Fandom, framed.',
  description:
    'Anime art, gaming gear, and custom pieces from a scrappy crew of independent artists. Printed to glow on your wall.'
}

const VALUE_PROPS = [
  { label: 'Backlit-ready', detail: 'Premium acrylic that glows' },
  { label: 'Indie artists', detail: 'Every drop is original art' },
  { label: 'Custom builds', detail: 'Your fandom, your way' },
  { label: 'Ships worldwide', detail: 'From our crew to your wall' }
]

const TILES: { href: Route; kicker: string; title: string; blurb: string }[] = [
  {
    href: '/shop' as Route,
    kicker: '01',
    title: 'Anime art',
    blurb: 'The heroes, the arcs, the moments — framed.'
  },
  {
    href: '/shop' as Route,
    kicker: '02',
    title: 'Gaming gear',
    blurb: 'Setup-ready pieces for the grind.'
  },
  {
    href: '/custom/acrylic' as Route,
    kicker: '03',
    title: 'Custom & stickers',
    blurb: 'Bring the idea, we bring the glow.'
  }
]

export default function HomePage() {
  return (
    <div>
      {/* ===== Hero ===== */}
      <section className="scanlines relative overflow-hidden border-b border-line">
        {/* Decorative JDM/anime backdrop */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-6 top-1/2 -translate-y-1/2 select-none font-display text-[26vw] leading-none text-purple/10 md:text-[18rem]"
        >
          アニメ
        </span>
        <div className="speed-lines pointer-events-none absolute inset-0 opacity-60" />

        <div className="relative mx-auto max-w-7xl px-4 py-20 md:py-28">
          <p className="eyebrow">New drops every week</p>
          <h1 className="mt-6">
            <span className="sr-only">Animeniacs</span>
            <Logo className="w-full max-w-2xl text-bone drop-shadow-[0_0_45px_rgba(139,61,255,0.5)]" />
          </h1>
          <p className="font-display mt-7 text-5xl text-bone md:text-6xl">
            Fandom, <span className="neon-text">framed.</span>
          </p>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Anime art, gaming gear, and custom pieces from a scrappy crew of independent artists —
            printed on premium acrylic and built to glow on your wall.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link href={'/shop' as Route} className="btn-neon">
              Shop the drop
              <span aria-hidden="true">→</span>
            </Link>
            <Link href={'/artist' as Route} className="btn-ghost">
              Meet the artists
            </Link>
          </div>
        </div>
      </section>

      {/* ===== Value props ===== */}
      <section aria-label="Why Animeniacs" className="border-b border-line bg-ink-2">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px md:grid-cols-4">
          {VALUE_PROPS.map((prop) => (
            <div key={prop.label} className="px-4 py-7 md:px-6">
              <p className="font-display text-2xl tracking-wide text-purple-soft">{prop.label}</p>
              <p className="mt-1 text-sm text-muted">{prop.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Shop tiles ===== */}
      <section aria-labelledby="shop-by" className="mx-auto max-w-7xl px-4 py-20">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Pick your lane</p>
            <h2 id="shop-by" className="font-display mt-2 text-4xl text-bone md:text-5xl">
              Shop the collection
            </h2>
          </div>
          <Link
            href={'/shop' as Route}
            className="link-neon hidden whitespace-nowrap text-sm font-medium sm:block"
          >
            View all →
          </Link>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {TILES.map((tile) => (
            <Link key={tile.title} href={tile.href} className="group hover:no-underline">
              <article className="card-street scanlines flex aspect-[4/3] flex-col justify-between overflow-hidden p-6">
                <span className="font-mono text-sm text-faint">{tile.kicker}</span>
                <div>
                  <h3 className="font-display text-4xl text-bone transition-colors group-hover:text-neon">
                    {tile.title}
                  </h3>
                  <p className="mt-2 max-w-[22ch] text-sm text-muted">{tile.blurb}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-purple-soft">
                    Shop now <span aria-hidden="true">→</span>
                  </span>
                </div>
              </article>
            </Link>
          ))}
        </div>
      </section>

      {/* ===== Artist CTA band ===== */}
      <section className="border-y border-line bg-wall">
        <div className="speed-lines">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-16 md:flex-row md:items-center">
            <div>
              <p className="eyebrow">For the artists</p>
              <h2 className="font-display mt-2 text-4xl text-bone md:text-5xl">
                Put your art on the <span className="neon-text">wall</span>
              </h2>
              <p className="mt-3 max-w-lg text-muted">
                We&apos;re a crew, not a corporation. Sell your work, keep your name on it, and get
                paid.
              </p>
            </div>
            <a href="https://affiliates.animeniacs.shop" className="btn-neon shrink-0">
              Become an artist
              <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
