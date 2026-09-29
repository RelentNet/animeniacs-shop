import { ArtMarquee } from '@/components/home/ArtMarquee'
import { ArtistSpotlight } from '@/components/home/ArtistSpotlight'
import { CraftSection } from '@/components/home/CraftSection'
import { DropCarousel } from '@/components/home/DropCarousel'
import { Marquee } from '@/components/home/Marquee'
import { Reveal } from '@/components/home/Reveal'
import { GhostLogo } from '@/components/layout/GhostLogo'
import { Logo } from '@/components/layout/Logo'
import { getFeaturedProducts } from '@/lib/products/featured'
import { getArtistSpotlight } from '@/lib/products/spotlight'
import type { ArtistProduct } from '@/lib/square/items'
import type { Route } from 'next'
import Image from 'next/image'
import Link from 'next/link'

export const metadata = {
  title: 'Animeniacs — Fandom, framed.',
  description:
    'Anime art, gaming gear, and custom pieces from a scrappy crew of independent artists. Printed on premium backlit acrylic and built to glow on your wall.'
}

// Homepage data (the "latest drops" rail + hero art) is sourced at runtime and
// re-rendered every 5 min. It prerenders empty during `next build` (no DB/Square
// reachable) and warms on first runtime render — the hero itself is fully static.
export const revalidate = 300

const TRUST = ['Backlit-ready acrylic', 'Original indie art', 'Custom builds', 'Ships worldwide']

const MARQUEE = [
  'Original art',
  'Indie artists',
  'Backlit acrylic',
  'New drops weekly',
  'Your fandom',
  'Ships worldwide'
]

const LANES: { href: Route; kicker: string; title: string; blurb: string }[] = [
  { href: '/shop' as Route, kicker: '01', title: 'Anime art', blurb: 'The heroes, the arcs, the moments — framed.' },
  { href: '/shop' as Route, kicker: '02', title: 'Gaming gear', blurb: 'Setup-ready pieces for the grind.' },
  { href: '/shop' as Route, kicker: '03', title: 'Custom & stickers', blurb: 'Bring the idea, we bring the glow.' }
]

/** A single neon-framed art print used in the hero gallery-wall cluster. */
function FramedArt({
  src,
  alt,
  className,
  sticker,
  priority
}: {
  src: string
  alt: string
  className?: string
  sticker?: string
  priority?: boolean
}): JSX.Element {
  return (
    <div className={`card-street hud glow-purple overflow-hidden ${className ?? ''}`}>
      <div className="scanlines relative aspect-[2/3] w-full overflow-hidden">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 768px) 60vw, 320px"
          priority={priority}
          draggable={false}
          className="select-none object-cover"
        />
      </div>
      {sticker && (
        <span className="sticker absolute -right-2 top-3 z-10" aria-hidden="true">
          {sticker}
        </span>
      )}
    </div>
  )
}

export default async function HomePage(): Promise<JSX.Element> {
  const [featured, spotlight] = await Promise.all([getFeaturedProducts(20), getArtistSpotlight()])
  const art = featured.filter((p): p is ArtistProduct & { imageUrl: string } => Boolean(p.imageUrl))
  const railProducts = featured.slice(0, 12)
  const heroArt = art.slice(0, 3)
  const laneArt = art.slice(0, LANES.length)
  const craftImage = (art[3] ?? art[0])?.imageUrl
  const stripImages = art.slice(0, 16).map((p) => p.imageUrl)

  return (
    <div>
      {/* ============================ HERO ============================ */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="aurora pointer-events-none absolute inset-0 -z-10 opacity-70" />
        <div className="speed-lines pointer-events-none absolute inset-0 -z-10 opacity-40" />
        {/* Faint brand mark watermark behind the hero. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden"
        >
          <GhostLogo className="w-[150%] max-w-none text-purple/[0.05] md:w-[88%]" />
        </div>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-3 bottom-[-2.5rem] select-none font-display leading-none text-purple/[0.05] text-[40vw] md:text-[20rem]"
        >
          アニメ
        </span>

        <div className="relative mx-auto grid max-w-7xl content-center items-center gap-10 px-4 py-16 md:min-h-[80vh] md:grid-cols-[1.05fr_0.95fr] md:py-20">
          {/* Copy */}
          <div>
            <p
              className="enter eyebrow inline-flex items-center gap-2 rounded-full border border-line-strong bg-wall/40 px-3 py-1.5"
              style={{ animationDelay: '60ms' }}
            >
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-neon shadow-[0_0_10px_var(--color-neon)] motion-reduce:animate-none" />
              New drops every week
            </p>
            <h1 className="mt-6 font-display text-7xl leading-[0.82] text-bone [text-shadow:0_4px_60px_rgba(139,61,255,0.35)] sm:text-8xl md:text-[8.5rem]">
              <span className="enter block" style={{ animationDelay: '150ms' }}>
                Fandom,
              </span>
              <span className="enter neon-text block" style={{ animationDelay: '270ms' }}>
                framed.
              </span>
            </h1>
            <p
              className="enter mt-6 max-w-md text-lg leading-relaxed text-muted"
              style={{ animationDelay: '380ms' }}
            >
              Original anime &amp; gaming art from a scrappy crew of independent artists — printed on
              premium backlit acrylic and built to glow on your wall.
            </p>

            {/* Mobile-only hero art — desktop gets the gallery-wall cluster instead. */}
            {heroArt[0] && (
              <div
                className="enter mx-auto mt-8 w-44 max-w-[60%] sm:w-52 md:hidden"
                style={{ animationDelay: '320ms' }}
              >
                <div className="float-slow">
                  <FramedArt src={heroArt[0].imageUrl} alt={heroArt[0].name} sticker="New drop" priority />
                </div>
              </div>
            )}

            <div
              className="enter mt-8 flex flex-wrap items-center gap-4"
              style={{ animationDelay: '480ms' }}
            >
              <Link href={'/shop' as Route} className="btn-neon">
                Shop the drop
                <span aria-hidden="true">→</span>
              </Link>
              <Link href={'/artist' as Route} className="btn-ghost">
                Meet the artists
              </Link>
            </div>
            <ul
              className="enter mt-10 flex flex-wrap gap-x-6 gap-y-2"
              style={{ animationDelay: '580ms' }}
            >
              {TRUST.map((t) => (
                <li key={t} className="flex items-center gap-2 text-sm text-muted">
                  <span className="text-neon" aria-hidden="true">
                    ✦
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>

          {/* Gallery-wall cluster */}
          {heroArt.length >= 3 ? (
            <div
              className="enter-pop relative mx-auto hidden h-[600px] w-full max-w-lg md:block [perspective:1600px]"
              style={{ animationDelay: '360ms' }}
            >
              {/* Glow halo grounding the cluster */}
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-[72%] w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple/25 blur-[90px]" />
              <div className="float-slow absolute inset-0">
                <FramedArt
                  src={heroArt[1].imageUrl}
                  alt={heroArt[1].name}
                  className="absolute left-0 top-16 w-[50%] opacity-90 [transform:rotateY(13deg)_rotate(-6deg)]"
                />
                <FramedArt
                  src={heroArt[2].imageUrl}
                  alt={heroArt[2].name}
                  className="absolute right-0 top-4 w-[48%] opacity-90 [transform:rotateY(-11deg)_rotate(4deg)]"
                />
                <FramedArt
                  src={heroArt[0].imageUrl}
                  alt={heroArt[0].name}
                  sticker="New drop"
                  priority
                  className="absolute left-[19%] top-28 w-[62%] -rotate-1 shadow-[0_36px_90px_-24px_rgba(139,61,255,0.75)]"
                />
              </div>
            </div>
          ) : (
            heroArt[0] && (
              <div
                className="enter-pop mx-auto hidden w-full max-w-sm md:block"
                style={{ animationDelay: '360ms' }}
              >
                <div className="float-slow">
                  <FramedArt src={heroArt[0].imageUrl} alt={heroArt[0].name} sticker="New drop" />
                </div>
              </div>
            )
          )}
        </div>

        {/* Marquee ticker pinned to the hero base */}
        <div className="enter border-t border-line bg-ink-2/60 py-3" style={{ animationDelay: '680ms' }}>
          <Marquee items={MARQUEE} />
        </div>
      </section>

      {/* ======================= LATEST DROPS ======================= */}
      {railProducts.length > 0 && (
        <section aria-labelledby="drops" className="mx-auto max-w-7xl px-4 py-16 md:py-20">
          <Reveal>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Fresh off the press</p>
                <h2 id="drops" className="font-display mt-2 text-4xl text-bone md:text-5xl">
                  Latest drops
                </h2>
              </div>
              <Link
                href={'/shop' as Route}
                className="link-neon hidden whitespace-nowrap text-sm font-medium sm:block"
              >
                View all →
              </Link>
            </div>
          </Reveal>

          <DropCarousel products={railProducts} />
        </section>
      )}

      {/* ========================= THE CRAFT ========================= */}
      <CraftSection imageUrl={craftImage} />

      {/* ======================= SHOP BY LANE ======================= */}
      <section aria-labelledby="lanes" className="border-y border-line bg-ink-2">
        <div className="mx-auto max-w-7xl px-4 py-16 md:py-20">
          <Reveal>
            <p className="eyebrow">Pick your lane</p>
            <h2 id="lanes" className="font-display mt-2 text-4xl text-bone md:text-5xl">
              Shop the collection
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {LANES.map((lane, i) => (
              <Reveal key={lane.title} delay={i * 90}>
                <Link href={lane.href} className="group block hover:no-underline">
                  <article className="card-street hud relative aspect-[4/3] overflow-hidden">
                    {laneArt[i] ? (
                      <Image
                        src={laneArt[i].imageUrl}
                        alt=""
                        fill
                        sizes="(max-width: 768px) 100vw, 33vw"
                        draggable={false}
                        className="select-none object-cover opacity-50 transition-all duration-500 group-hover:scale-105 group-hover:opacity-75"
                      />
                    ) : (
                      <div className="speed-lines absolute inset-0 opacity-40" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-transparent" />
                    <div className="relative flex h-full flex-col justify-between p-6">
                      <span className="w-fit rounded border border-line-strong bg-ink/50 px-2 py-0.5 font-mono text-xs text-neon backdrop-blur-sm">
                        {lane.kicker}
                      </span>
                      <div>
                        <h3 className="font-display text-4xl text-bone transition-colors group-hover:text-neon">
                          {lane.title}
                        </h3>
                        <p className="mt-2 max-w-[24ch] text-sm text-muted">{lane.blurb}</p>
                        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-purple-soft transition-colors group-hover:text-neon">
                          Shop now
                          <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
                            →
                          </span>
                        </span>
                      </div>
                    </div>
                  </article>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ====================== ARTIST SPOTLIGHT ====================== */}
      {spotlight && <ArtistSpotlight spotlight={spotlight} />}

      {/* ======================= ART STRIP BAND ======================= */}
      {stripImages.length >= 6 && (
        <section
          aria-labelledby="wall"
          className="relative overflow-hidden border-y border-line bg-ink-2 py-12"
        >
          <div className="mx-auto mb-8 flex max-w-7xl items-end justify-between gap-4 px-4">
            <div>
              <p className="eyebrow">Straight off the press</p>
              <h2 id="wall" className="font-display mt-2 text-4xl text-bone md:text-5xl">
                The wall
              </h2>
            </div>
            <Link
              href={'/shop' as Route}
              className="link-neon hidden whitespace-nowrap text-sm font-medium sm:block"
            >
              Shop everything →
            </Link>
          </div>
          <ArtMarquee images={stripImages} />
        </section>
      )}

      {/* ======================= ARTIST CTA ======================= */}
      <section className="border-b border-line bg-wall">
        <div className="speed-lines">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-16 md:flex-row md:items-center">
            <Reveal>
              <p className="eyebrow">For the artists</p>
              <h2 className="font-display mt-2 text-4xl text-bone md:text-5xl">
                Put your art on the <span className="neon-text">wall</span>
              </h2>
              <p className="mt-3 max-w-lg text-muted">
                We&apos;re a crew, not a corporation. Sell your work, keep your name on it, and get
                paid.
              </p>
            </Reveal>
            <a href="https://affiliates.animeniacs.shop" className="btn-neon shrink-0">
              Become an artist
              <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </section>

      {/* ======================= CLOSING CTA ======================= */}
      <section className="scanlines relative overflow-hidden">
        <div className="aurora pointer-events-none absolute inset-0 -z-10 opacity-80" />
        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 py-24 text-center md:py-32">
          <Reveal>
            <Logo className="mx-auto w-64 drop-shadow-[0_0_55px_rgba(139,61,255,0.55)] md:w-96" />
            <h2 className="font-display mt-8 text-5xl text-bone md:text-6xl">
              Find your next <span className="neon-text">wall piece</span>
            </h2>
            <p className="mx-auto mt-4 max-w-md text-muted">
              Original art, printed to glow. New drops every week — pull up and pick your fandom.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link href={'/shop' as Route} className="btn-neon">
                Shop all art
                <span aria-hidden="true">→</span>
              </Link>
              <Link href={'/artist' as Route} className="btn-ghost">
                Meet the artists
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  )
}
