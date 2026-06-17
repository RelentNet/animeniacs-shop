import { GhostLogo } from '@/components/layout/GhostLogo'
import { Logo } from '@/components/layout/Logo'
import type { Route } from 'next'
import Link from 'next/link'

export const metadata = {
  title: 'Brand Kit | Animeniacs',
  description:
    'Logos, colors, type, and usage guidelines for repping Animeniacs in posts, features, and collabs.'
}

const DOWNLOADS = [
  {
    label: 'Logo — white',
    sub: 'For dark backgrounds',
    href: '/brand/animeniacs-logo-white.svg',
    ext: 'SVG'
  },
  {
    label: 'Logo — black',
    sub: 'For light backgrounds',
    href: '/brand/animeniacs-logo-black.svg',
    ext: 'SVG'
  },
  {
    label: 'Logo — duotone',
    sub: 'The signature treatment',
    href: '/brand/animeniacs-logo-duotone.svg',
    ext: 'SVG'
  },
  {
    label: 'Logo — original',
    sub: 'High-res line art',
    href: '/brand/animeniacs-logo.png',
    ext: 'PNG'
  }
]

const PALETTE = [
  { name: 'Ink', hex: '#0D0A14', use: 'Backgrounds' },
  { name: 'Wall', hex: '#1A0F2E', use: 'Cards & surfaces' },
  { name: 'Brand purple', hex: '#8B3DFF', use: 'Primary brand' },
  { name: 'Soft purple', hex: '#C4A5FF', use: 'Secondary accents' },
  { name: 'Neon green', hex: '#39FF14', use: 'Accent only' },
  { name: 'Bone', hex: '#F3EEFF', use: 'Text on dark' }
]

const FONTS = [
  {
    name: 'Bebas Neue',
    role: 'Display & headlines',
    cls: 'font-display text-5xl',
    sample: 'Fandom at its best'
  },
  {
    name: 'Space Grotesk',
    role: 'Body & interface',
    cls: 'text-2xl',
    sample: 'Anime art, gaming gear, custom pieces.'
  },
  {
    name: 'Space Mono',
    role: 'Labels & HUD',
    cls: 'font-mono text-xl uppercase tracking-widest',
    sample: 'New drops weekly'
  }
]

const DOS = [
  'Give the logo breathing room — keep clear space around it.',
  'White mark on dark, black mark on light.',
  'Keep neon green for accents only — never large fills.',
  'Scale it proportionally so the details stay crisp.'
]

const DONTS = [
  'Stretch, squish, or rotate the mark.',
  'Recolor it outside the palette below.',
  'Add drop shadows, outlines, or extra effects.',
  'Drop it on a busy background that kills legibility.'
]

function DownloadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

export default function BrandKitPage(): JSX.Element {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      {/* Intro */}
      <header className="max-w-2xl">
        <p className="eyebrow">Press &amp; partners</p>
        <h1 className="font-display mt-2 text-6xl text-bone md:text-7xl">Brand kit</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted">
          Repping Animeniacs in a post, a feature, or a collab? Right on. Grab the logos below and
          keep it looking clean with the quick guidelines — colors, type, and a few do&apos;s and
          don&apos;ts.
        </p>
      </header>

      {/* The mark */}
      <section aria-labelledby="logos" className="mt-16">
        <p className="eyebrow">The mark</p>
        <h2 id="logos" className="font-display mt-2 text-4xl text-bone">
          Our logo
        </h2>

        {/* Signature duotone on a showcase panel */}
        <div className="hud scanlines mt-6 flex items-center justify-center rounded-xl border border-line-strong bg-ink p-10">
          <Logo className="w-full max-w-xl drop-shadow-[0_0_45px_rgba(139,61,255,0.5)]" />
        </div>

        {/* Variants */}
        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          <figure className="card-street flex flex-col items-center gap-3 p-8">
            <span className="text-bone">
              <GhostLogo className="h-16 w-auto" />
            </span>
            <figcaption className="font-mono text-xs uppercase tracking-widest text-faint">
              White on dark
            </figcaption>
          </figure>
          <figure className="flex flex-col items-center gap-3 rounded-lg border border-line bg-bone p-8">
            <span className="text-ink">
              <GhostLogo className="h-16 w-auto" />
            </span>
            <figcaption className="font-mono text-xs uppercase tracking-widest text-faint">
              Black on light
            </figcaption>
          </figure>
          <figure className="card-street flex flex-col items-center gap-3 p-8">
            <Logo className="h-16 w-auto" />
            <figcaption className="font-mono text-xs uppercase tracking-widest text-faint">
              Duotone signature
            </figcaption>
          </figure>
        </div>

        {/* Downloads */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DOWNLOADS.map((file) => (
            <a
              key={file.href}
              href={file.href}
              download
              className="card-street flex items-center justify-between gap-3 p-4 hover:no-underline"
            >
              <span>
                <span className="block text-sm font-medium text-bone">{file.label}</span>
                <span className="block text-xs text-faint">{file.sub}</span>
              </span>
              <span className="flex items-center gap-1.5 font-mono text-xs text-neon">
                {file.ext}
                <DownloadIcon />
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* Usage do / don't */}
      <section aria-labelledby="usage" className="mt-20">
        <p className="eyebrow">Keep it clean</p>
        <h2 id="usage" className="font-display mt-2 text-4xl text-bone">
          Logo usage
        </h2>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <div className="card-street p-6">
            <h3 className="font-mono text-sm uppercase tracking-widest text-neon">Do</h3>
            <ul className="mt-4 space-y-3">
              {DOS.map((item) => (
                <li key={item} className="flex gap-3 text-sm text-muted">
                  <span aria-hidden="true" className="mt-0.5 text-neon">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="card-street p-6">
            <h3 className="font-mono text-sm uppercase tracking-widest text-purple-soft">
              Don&apos;t
            </h3>
            <ul className="mt-4 space-y-3">
              {DONTS.map((item) => (
                <li key={item} className="flex gap-3 text-sm text-muted">
                  <span aria-hidden="true" className="mt-0.5 text-purple-soft">
                    ✕
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Colors */}
      <section aria-labelledby="colors" className="mt-20">
        <p className="eyebrow">The palette</p>
        <h2 id="colors" className="font-display mt-2 text-4xl text-bone">
          Colors
        </h2>
        <p className="mt-3 max-w-xl text-muted">
          Purple carries the brand; neon green is the spray-paint accent — CTAs, highlights, never
          big fills.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {PALETTE.map((c) => (
            <div key={c.hex} className="card-street overflow-hidden">
              <div className="h-24 w-full" style={{ background: c.hex }} />
              <div className="p-3">
                <p className="text-sm font-medium text-bone">{c.name}</p>
                <p className="select-all font-mono text-xs text-neon">{c.hex}</p>
                <p className="mt-1 text-xs text-faint">{c.use}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Typography */}
      <section aria-labelledby="type" className="mt-20">
        <p className="eyebrow">The type</p>
        <h2 id="type" className="font-display mt-2 text-4xl text-bone">
          Typography
        </h2>
        <div className="mt-6 space-y-4">
          {FONTS.map((f) => (
            <div
              key={f.name}
              className="card-street flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between"
            >
              <p className={`text-bone ${f.cls}`}>{f.sample}</p>
              <div className="shrink-0 text-right">
                <p className="text-sm font-medium text-bone">{f.name}</p>
                <p className="font-mono text-xs uppercase tracking-widest text-faint">{f.role}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Voice */}
      <section aria-labelledby="voice" className="mt-20">
        <p className="eyebrow">The voice</p>
        <h2 id="voice" className="font-display mt-2 text-4xl text-bone">
          How we sound
        </h2>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <p className="text-muted">
            We&apos;re a scrappy crew — fandom at its best. Talk like a friend who&apos;s deep in
            the culture: hyped, inclusive, a little irreverent, never corporate. Celebrate the fans
            and the artists first.
          </p>
          <div className="card-street p-6">
            <p className="font-mono text-xs uppercase tracking-widest text-neon">Credit us</p>
            <p className="mt-3 text-sm text-muted">
              Tag{' '}
              <a
                href="https://instagram.com/animeniacs.shop"
                className="text-neon-soft"
                target="_blank"
                rel="noreferrer"
              >
                @animeniacs.shop
              </a>{' '}
              and link <span className="text-bone">animeniacs.shop</span> so folks can find the
              crew.
            </p>
          </div>
        </div>
      </section>

      {/* Press contact */}
      <section className="mt-20 overflow-hidden rounded-xl border border-line bg-wall">
        <div className="speed-lines">
          <div className="flex flex-col items-start justify-between gap-5 p-10 md:flex-row md:items-center">
            <div>
              <h2 className="font-display text-3xl text-bone md:text-4xl">
                Doing a feature or collab?
              </h2>
              <p className="mt-2 text-muted">
                Need something custom — a vector, a specific format, a quote? Reach out.
              </p>
            </div>
            <Link href={'/contact-us' as Route} className="btn-neon shrink-0">
              Contact us
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
